import client from '../utils/TwilioClient';

export const makeOutboundCall = async (to: string, from: string, url: string) => {
  return await client.calls.create({
    to,
    from,
    url, 
  });
};