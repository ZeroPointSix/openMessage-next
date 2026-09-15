export interface EgressEnvelope {
  interactionId: string;
  message: {
    id: string;
    origin: string;
    destination: string;
    content: string;
    createdAt: string;
  };
}

export interface EgressAdapter {
  deliver(address: string, envelope: EgressEnvelope): Promise<void>;
}

export interface MessageDispatcher {
  dispatch(envelope: EgressEnvelope): void;
}

export interface EgressLogger {
  error(
    bindings: {
      messageId: string;
      interactionId: string;
      destination: string;
      adapter: string;
      error: unknown;
    },
    message: string,
  ): void;
}
