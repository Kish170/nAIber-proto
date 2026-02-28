export const POST_CALL_QUEUE_NAME = 'post-call-processing' as const;

export interface PostCallJobData {
    conversationId: string;
    userId: string;
    isFirstCall: boolean;
    callType: 'general' | 'health_check';
    timestamp: number;
}
