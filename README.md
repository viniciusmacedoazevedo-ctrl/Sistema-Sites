# SiteHunter AI

Sistema privado para automatizar a prospecção e a venda de criação de sites para empresas locais.

Você escolhe regiões, nichos e limites e clica em **INICIAR AUTOMAÇÃO**. O trabalho roda em segundo plano no servidor, mesmo com o navegador fechado:

1. busca empresas reais (Google Places API);
2. normaliza e remove duplicadas;
3. verifica a presença digital;
4. pontua as oportunidades, explicando cada ponto;
5. gera textos com IA ou com templates;
6. cria um site de demonstração personalizado para cada empresa selecionada;
7. valida o site, inclusive em navegador real no tamanho de celular;
8. publica a demonstração em um link único e estável;
9. gera uma mensagem individual;
10. verifica se o contato é elegível;
11. envia somente o que for permitido;
12. atualiza o CRM;
13. gera um relatório.

Toda a interface está em português do Brasil.

---

## Sumário

- [Arquitetura](#arquitetura)
- [Rodando localmente](#rodando-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Configurando cada integração](#configurando-cada-integração)
- [Como usar](#como-usar)
- [Regras de envio e conformidade](#regras-de-envio-e-conformidade)
- [Controle de custos](#controle-de-custos)
- [Testes](#testes)
- [Colocando em produção](#colocando-em-produção)
- [O que depende de você](#o-que-depende-de-você)

---

## Arquitetura

| Parte | Tecnologia | Onde |
|---|---|---|
| Painel + API + demonstrações públicas | Next.js 15 (App Router) + TypeScript + Tailwind | `src/app` |
| Banco de dados | PostgreSQL + Prisma | `prisma/schema.prisma` |
| Fila persistente | Tabela `Job` no PostgreSQL (`FOR UPDATE SKIP LOCKED`), sem serviço extra | `src/server/queue.ts` |
| Worker (segundo plano) | Processo Node separado (`npm run worker`) | `src/worker/index.ts` |
| Etapas da automação | Funções idempotentes por etapa | `src/server/pipeline.ts` |
| Integrações (adaptadores) | Google Places, Anthropic (Claude), Vercel, WhatsApp Cloud API, SMTP | `src/server/discovery`, `ai.ts`, `publish`, `messaging` |
| Gerador de sites | 3 layouts × paletas por nicho × conteúdo personalizado, HTML estático sem JavaScript | `src/server/sitegen` |

**Por que a fila fica no Postgres:** não precisa de Redis nem de outro serviço pago, as tarefas sobrevivem a reinicializações e vários workers podem rodar ao mesmo tempo. Cada tarefa tem uma chave de idempotência, então enfileirar de novo nunca duplica uma ação. Tarefas presas por um worker que caiu voltam para a fila sozinhas. Retentativas usam espera exponencial com limite. Cada etapa tem timeout.

**Status das tarefas:** Pendente, Em andamento, Concluído, Falhou, Aguardando configuração, Aguardando autorização, Ignorado e Cancelado.

**Execuções:** podem ser pausadas, retomadas e canceladas. O botão "Reprocessar pendências" reabre tarefas que falharam ou aguardavam configuração, por exemplo depois que você adiciona uma chave de API.

## Rodando localmente

Pré-requisitos: Node 20 ou mais recente e PostgreSQL 14 ou mais recente.

```bash
npm install
cp .env.example .env               # preencha as variáveis (veja abaixo)
npm run hash-password -- "uma-senha-forte-aqui"   # cole o resultado em ADMIN_PASSWORD_HASH
openssl rand -base64 48            # cole em AUTH_SECRET
npx prisma migrate deploy          # cria as tabelas

# em dois terminais:
npm run dev                        # painel em http://localhost:3000
npm run worker                     # processa a automação em segundo plano
```

Entre com `ADMIN_USERNAME` e a senha que você escolheu. Na primeira vez, rode uma execução em **modo simulação**: ela percorre o fluxo inteiro com empresas fictícias, sem chaves e sem custo.

## Variáveis de ambiente

Todas as variáveis estão em `.env.example`. Nenhum segredo vai para o navegador nem para os sites de demonstração: o validador reprova qualquer HTML que contenha o valor de uma chave.

| Variável | Obrigatória? | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | Conexão PostgreSQL |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` | sim | Login do painel (hash bcrypt, aceita base64) |
| `AUTH_SECRET` | sim | Assina sessões e links de descadastro. Deve ser **igual** no painel e no worker |
| `PUBLIC_BASE_URL` | sim para modo real | URL pública do painel. Usada nos links `/d/<slug>` e no descadastro |
| `GOOGLE_PLACES_API_KEY` | sim para modo real | Descoberta de empresas |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | não | Textos com IA. Sem chave, usa templates (custo zero) |
| `VERCEL_TOKEN`, `VERCEL_TEAM_ID` | não | Publicar na Vercel. Sem token, usa a publicação interna |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | não | Envio oficial pelo WhatsApp e recebimento de respostas |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | não | Envio de e-mail |
| `CHROMIUM_EXECUTABLE_PATH` | não | Caminho do Chromium para validar a responsividade em navegador |
| `WORKER_CONCURRENCY` | não | Tarefas simultâneas por worker (padrão: 2) |

A página **Configurações** mostra quais integrações estão ativas, sem revelar os valores.

## Configurando cada integração

### Google Places API (descoberta de empresas reais)
1. Acesse <https://console.cloud.google.com/> e crie um projeto.
2. Ative a **Places API (New)** e configure o faturamento.
3. Em *APIs e serviços → Credenciais*, crie uma chave de API e restrinja o uso à Places API (New).
4. Coloque a chave em `GOOGLE_PLACES_API_KEY`, no painel e no worker.
5. Em **Configurações → Custos**, informe o preço por requisição de Text Search. Consulte a tabela oficial em <https://developers.google.com/maps/billing-and-pricing/pricing>. Os campos telefone e site entram em um SKU de custo maior.

Como o sistema usa a API:
- Apenas a Text Search, com uma *FieldMask* mínima: uma requisição traz até 20 empresas.
- Paginação de até 3 páginas por busca.
- Tratamento de 429 com nova tentativa.
- Chave recusada fica como "aguardando configuração".
- Exibe a atribuição "Dados: Google Maps".
- Dados vencidos (padrão de 30 dias, configurável) de empresas sem relacionamento comercial são removidos pela rotina de retenção.

**Antes de usar comercialmente, confira os termos atuais da Google Maps Platform** sobre armazenamento e exibição.

### Anthropic Claude (textos com IA, opcional)
1. Crie uma chave em <https://console.anthropic.com/>.
2. Coloque em `ANTHROPIC_API_KEY`. O modelo padrão é o econômico `claude-haiku-5-5`, configurável em `ANTHROPIC_MODEL`.
3. Os preços padrão de Haiku 5.5 vêm preenchidos (entrada e saída por milhão de tokens, conforme a documentação de outubro de 2026). Confirme em <https://www.anthropic.com/pricing> e ajuste se trocar o modelo.

A IA recebe somente fatos verificados. Se o texto produzido contiver preços, tempo de mercado, prêmios, certificações, avaliações, depoimentos, garantias ou percentuais, ele é **descartado** automaticamente e o template seguro é usado no lugar. Cada conteúdo é gerado uma vez por empresa e reaproveitado depois.

### Publicação das demonstrações
- **Interna (padrão, sem custo extra):** o próprio servidor serve `PUBLIC_BASE_URL/d/<slug>`. O link é estável. Despublicar faz a rota responder 410.
- **Vercel (opcional):** crie um token em <https://vercel.com/account/tokens>, informe `VERCEL_TOKEN` (e `VERCEL_TEAM_ID`, se usar um time) e escolha "Vercel" em Configurações. Cada empresa ganha um projeto `sh-<slug>` com domínio estável. O plano Hobby da Vercel é restrito a uso não comercial; verifique os termos e o plano adequado.

Nos dois casos, o site só é marcado como publicado **depois** que o sistema acessa o link e recebe HTTP 200.

As demonstrações:
- têm aviso de "proposta demonstrativa não oficial" e link "Solicitar remoção";
- usam `noindex`, não usam fotos de terceiros nem logotipos, e não têm JavaScript.

### WhatsApp Business Platform (Cloud API, oficial)
1. Em <https://developers.facebook.com/>, crie um app do tipo *Business* e adicione o produto **WhatsApp**.
2. Cadastre e verifique um número comercial. Anote o **Phone number ID** e gere um **token permanente** (usuário do sistema).
3. Crie e envie para aprovação um **modelo (template)** da categoria marketing. O corpo deve ter exatamente duas variáveis: `{{1}}` = nome da empresa e `{{2}}` = link da demonstração. Informe o nome e o idioma do template em Configurações.
4. Configure o webhook:
   - URL de callback: `PUBLIC_BASE_URL/api/webhooks/whatsapp`
   - Token de verificação: o valor de `WHATSAPP_VERIFY_TOKEN`
   - Campos assinados: `messages`
   - `WHATSAPP_APP_SECRET` (o "App Secret" do app) é usado para validar a assinatura de cada chamada.
5. Preencha o preço por mensagem conforme <https://developers.facebook.com/docs/whatsapp/pricing>.

O webhook registra as respostas no CRM (status "Respondeu"), atualiza o status de entrega e lido, e processa pedidos de "PARAR" e "SAIR" como descadastro.

### E-mail (SMTP, opcional)
Use qualquer provedor SMTP e preencha as variáveis `SMTP_*`. Antes de qualquer envio, marque em Configurações a confirmação de base legal para e-mail B2B.

Toda mensagem inclui:
- a identificação do remetente;
- um link de descadastro;
- o cabeçalho `List-Unsubscribe`.

O Google Places não fornece e-mails. O canal só é usado quando você cadastra o e-mail comercial público da empresa na ficha do CRM.

## Como usar

1. **Configurações:** preencha seu nome, os limites diários de gasto e de envio, e os preços. O envio automático começa **desligado**.
2. **Iniciar automação:**
   - escolha o país, o estado, uma ou mais cidades e bairros, e um ou mais nichos (também é possível digitar outros);
   - defina o máximo de empresas e de sites, o limite de gasto da execução, a pontuação mínima, os canais e o uso de IA;
   - clique em **Calcular estimativa** para ver o custo no pior caso;
   - clique em **INICIAR AUTOMAÇÃO**.
3. **Execuções:** progresso por etapa em tempo real, tarefas que precisam de atenção (com o motivo) e botões de pausar, retomar, cancelar e reprocessar.
4. **Empresas / CRM:**
   - busca, filtros por status, presença digital e cidade, ordenação e exportação CSV;
   - ficha com o motivo de cada ponto da pontuação, edição de status, observações e próxima ação, histórico e exclusão de dados.
5. **Demonstrações:** prévia, relatório de validação, itens "a confirmar com a empresa", publicar, despublicar, regerar e excluir.
6. **Mensagens:**
   - texto de cada mensagem, motivo de bloqueio e alternativa de contato;
   - copiar, editar, abrir no seu próprio WhatsApp para envio manual, marcar como enviada e reavaliar depois de registrar um opt-in;
   - cadastro de opt-ins com base e evidência.
7. **Relatórios:** funil, taxa de resposta, gastos por dia e por recurso, resultados por nicho.
8. **Privacidade e bloqueios:** lista de supressão (guarda só o hash), retenção, remoção dos dados de simulação e registro de auditoria.

## Regras de envio e conformidade

O envio automático acontece somente quando **todas** as condições abaixo são verdadeiras:

- execução em modo real, com uma empresa real (dados de simulação nunca são enviados);
- envio automático ativado em Configurações;
- o contato não está na lista de bloqueio nem marcado como "não contatar";
- o contato nunca recebeu uma abordagem inicial (uma por empresa e por destinatário);
- o canal está configurado e o limite diário do canal não foi atingido (se foi, o envio fica para o dia seguinte);
- **WhatsApp:** o número é celular, existe opt-in registrado e há um template aprovado. Um telefone comercial público **não** é tratado como autorização;
- **E-mail:** a base legal foi confirmada, existe link de descadastro e o e-mail comercial é conhecido.

Quando o envio não é permitido, o sistema salva o rascunho, registra o motivo e sugere uma alternativa, como contato manual pelo telefone ou o perfil público.

Proteções contra envio duplicado:
- Transição atômica do status "na fila" para "enviando".
- Se o processo cair durante o envio, a mensagem vai para **"Verificar envio manualmente"** e **não** é reenviada até você confirmar no provedor.
- Erros de rede com resultado incerto seguem a mesma regra.
- Apenas a rejeição explícita por limite (429) volta para a fila.

O sistema não usa automação do WhatsApp Web e não contorna limites nem mecanismos antispam.

## Controle de custos

- Antes de cada execução: estimativa do pior caso, item a item, indicando o que é gratuito e o que pode gerar cobrança.
- Antes de cada operação paga: verificação do preço configurado, do limite da execução e do limite diário. Se o limite for atingido, as novas operações pagas são **ignoradas** com uma explicação. As tarefas sem custo continuam (por exemplo, textos por template e publicação interna).
- **Preços desconhecidos não são inventados.** Por padrão, a operação fica "aguardando configuração" até você preencher o preço.
- Para evitar gastos repetidos, o sistema:
  - reaproveita a verificação de presença digital por 7 dias;
  - reaproveita o conteúdo já gerado;
  - consulta a Places API com FieldMask mínima;
  - usa um modelo de IA econômico com esforço baixo;
  - publica internamente por padrão.
- Limite máximo de demonstrações publicadas e retenção automática: demonstrações antigas sem interesse são despublicadas.

## Testes

```bash
# usa um banco separado: TEST_DATABASE_URL (padrão postgresql://sitehunter:sitehunter@localhost:5432/sitehunter_test)
npm test
npm run typecheck
npm run lint
```

São 63 testes, cobrindo:
- descoberta, com o Google Places simulado e paginação;
- deduplicação;
- pontuação;
- presença digital, incluindo robots.txt e proteção contra SSRF;
- geração de conteúdo, incluindo o descarte de texto inventado;
- validação de sites, incluindo um teste em Chromium real;
- publicação interna e na Vercel (simulada);
- fila: concorrência, pausa e recuperação após queda;
- fluxo completo em simulação e em modo real com mocks;
- bloqueio de mensagens duplicadas e envio interrompido;
- regras de envio;
- controle de gastos;
- autenticação, sessões e proteção contra força bruta;
- exclusão de dados e descadastro;
- assinatura do webhook.

Nenhum teste faz chamadas externas nem gera gastos.

## Colocando em produção

Você precisa de três peças: **PostgreSQL**, **serviço web** (`npm run start:prod`, que aplica as migrações e inicia o painel) e **worker** (`npm run worker`, sempre ligado).

- **Render:** o arquivo `render.yaml` cria as três peças. Web e worker compartilham o mesmo grupo de variáveis, então o `AUTH_SECRET` fica igual nos dois.
- **Railway, Fly.io ou VPS:** use o `Dockerfile`. O comando padrão sobe o painel; para o worker, use o comando `npm run worker`.
- Defina `PUBLIC_BASE_URL` com o domínio público (HTTPS) e reinicie.
- Para validar em navegador no worker, instale o Chromium na imagem e defina `CHROMIUM_EXECUTABLE_PATH`. Sem ele, a validação estática continua e o teste em navegador fica marcado como não executado.
- Rode um único worker no início (`WORKER_CONCURRENCY=2`). Pode aumentar depois.

Verifique os preços atuais dos planos de hospedagem: workers sempre ligados normalmente não entram em planos gratuitos.

## O que depende de você

- **Chaves e contas:** Google Places (obrigatória para buscar empresas reais), WhatsApp Cloud API com número e template aprovados, SMTP, e opcionalmente Anthropic e Vercel.
- **Preços:** preencher em Configurações → Custos a partir das páginas oficiais.
- **Opt-ins:** registrar as autorizações reais de contato. Sem elas, o WhatsApp automático fica bloqueado por design.
- **Revisão jurídica:** confirmar a base legal (LGPD) para o seu uso de e-mail B2B e os termos de cada plataforma (Google Maps Platform, Meta e o seu provedor de hospedagem).
