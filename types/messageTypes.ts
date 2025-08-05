export const INTERNAL_MESSAGE_TYPE_PREFIX = `__msg:`;

export const MessageType = {
    Any: `${INTERNAL_MESSAGE_TYPE_PREFIX}Any`,
    Text: `${INTERNAL_MESSAGE_TYPE_PREFIX}Text`,
    Sticker: `${INTERNAL_MESSAGE_TYPE_PREFIX}Sticker`,
    Animation: `${INTERNAL_MESSAGE_TYPE_PREFIX}Animation`,
    Document: `${INTERNAL_MESSAGE_TYPE_PREFIX}Document`,
    Voice: `${INTERNAL_MESSAGE_TYPE_PREFIX}Voice`,
    Audio: `${INTERNAL_MESSAGE_TYPE_PREFIX}Audio`,
    LeftChatMember: `${INTERNAL_MESSAGE_TYPE_PREFIX}LeftChatMember`,
    NewChatMember: `${INTERNAL_MESSAGE_TYPE_PREFIX}NewChatMember`,
    Poll: `${INTERNAL_MESSAGE_TYPE_PREFIX}Poll`,
    Location: `${INTERNAL_MESSAGE_TYPE_PREFIX}Location`,
    Photo: `${INTERNAL_MESSAGE_TYPE_PREFIX}Photo`,
    Forward: `${INTERNAL_MESSAGE_TYPE_PREFIX}Forward`,
    Video: `${INTERNAL_MESSAGE_TYPE_PREFIX}Video`,
    Unknown: `${INTERNAL_MESSAGE_TYPE_PREFIX}Unknown`
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];
