export const MessageType = {
    Text: '__msg:Text',
    Sticker: '__msg:Sticker',
    Animation: '__msg:Animation',
    Document: '__msg:Document',
    Voice: '__msg:Voice',
    Audio: '__msg:Audio',
    LeftChatMember: '__msg:LeftChatMember',
    NewChatMember: '__msg:NewChatMember',
    Poll: '__msg:Poll',
    Location: '__msg:Location',
    Photo: '__msg:Photo',
    Unknown: '__msg:Unknown'
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];
