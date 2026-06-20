export type ChatContextMessage = {
  id?: string;
  direction: 'owner' | 'contact';
  body: string;
  timestamp?: number;
  authorName?: string;
};

export type GenerateReplyInput = {
  model: string;
  modelLabel: string;
  ownerStylePrompt: string;
  messages: ChatContextMessage[];
  incomingMessage: string;
  incomingMessageQuoted?: { body: string; direction: 'owner' | 'contact' };
  isGroup?: boolean;
  chatName?: string;
};

export type GenerateReplyResult = {
  text: string;
  provider: string;
  model: string;
};

export interface LlmProvider {
  generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult>;
}
