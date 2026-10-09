export interface PublishInput {
  slug: string;
  html: string;
}

export interface PublishResult {
  publicUrl: string;
  providerRef: string;
}

export interface Publisher {
  id: string;
  publish(input: PublishInput): Promise<PublishResult>;
  unpublish(ref: { slug: string; providerRef: string | null }): Promise<void>;
}
