const VoiceResponse = require('twilio').twiml.VoiceResponse;

export const questionAndResponseHandling = async(message: String, question: String, step: Number): Promise<String> => {
    const twiML = new VoiceResponse();
    twiML.say(message)
    twiML.gather({
        input: 'speech',
        action: `/onboarding?step=${step}`,
        method: 'POST',
        timeout: 5,
    }).say(question);

    return twiML.toString();
};
