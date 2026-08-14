export interface NotificationProvider {
  readonly name: string;
  send(params: { to: string; subject?: string; body: string }): Promise<{ messageId: string }>;
}

export interface ProviderSendResult {
  messageId: string;
}
