import { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import PubNub, { GrantTokenParameters, GrantTokenPermissions } from "pubnub";
import allowCors from "./allowCors";
import {
  InitiatePublishResponse,
  InitiateSubscribeResponse,
  PublishResponse,
  PublishTokenObject,
  PubsubMessage,
  SubscribeResponse,
  SubscribeTokenObject,
  isInitiatePublishRequest,
  isInitiateSubscribeRequest,
  isPublishRequest,
  isPublishTokenObject,
  isSubscribeRequest,
  isSubscribeTokenObject,
} from "./types";

const PUBNUB_SUBSCRIBE_KEY = process.env.PUBNUB_SUBSCRIBE_KEY;
if (!PUBNUB_SUBSCRIBE_KEY) {
  throw new Error("Missing PUBNUB_SUBSCRIBE_KEY");
}
const PUBNUB_PUBLISH_KEY = process.env.PUBNUB_PUBLISH_KEY;
if (!PUBNUB_PUBLISH_KEY) {
  throw new Error("Missing PUBNUB_PUBLISH_KEY");
}
const PUBNUB_SECRET_KEY = process.env.PUBNUB_SECRET_KEY;
if (!PUBNUB_SECRET_KEY) {
  throw new Error("Missing PUBNUB_SECRET_KEY");
}
const SYSTEM_PUBLIC_KEY = process.env.SYSTEM_PUBLIC_KEY;
if (!SYSTEM_PUBLIC_KEY) {
  throw new Error("Missing SYSTEM_PUBLIC_KEY");
}
const SYSTEM_PRIVATE_KEY = process.env.SYSTEM_PRIVATE_KEY;
if (!SYSTEM_PRIVATE_KEY) {
  throw new Error("Missing SYSTEM_PRIVATE_KEY");
}

const currentPublishDifficulty = 13;
const currentPublishDelay = 500;
const currentSubscribeDifficulty = 13;
const currentSubscribeDelay = 500;

const pubnubClient = new PubNub({
  publishKey: PUBNUB_PUBLISH_KEY,
  subscribeKey: PUBNUB_SUBSCRIBE_KEY,
  secretKey: PUBNUB_SECRET_KEY,
  userId: "hchat-api",
});

export const initiatePublishHandler = allowCors(
  async (req: VercelRequest, res: VercelResponse) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      const rr = req.body;
      if (!isInitiatePublishRequest(rr)) {
        throw new Error("Invalid request");
      }
      const { senderPublicKey, channel, messageSize, messageSignature } = rr;
      assertValidChannel(channel);
      assertValidMessageSize(messageSize);
      const publishTokenObject: PublishTokenObject = {
        timestamp: Date.now(),
        difficulty: currentPublishDifficulty,
        delay: currentPublishDelay,
        senderPublicKey,
        channel,
        messageSize,
        messageSignature,
      };
      const publishToken = JSON.stringify(publishTokenObject);
      const tokenSignature = await signMessage(
        publishToken,
        SYSTEM_PRIVATE_KEY,
      );
      const resp: InitiatePublishResponse = {
        type: "initiatePublishResponse",
        publishToken,
        tokenSignature,
      };
      res.status(200).json(resp);
    } catch (error) {
      res.status(500).json({ error: error.message });
      return;
    }
  },
);

export const publishHandler = allowCors(
  async (req: VercelRequest, res: VercelResponse) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      const rr = req.body;
      if (!isPublishRequest(rr)) {
        throw new Error("Invalid request");
      }
      const { publishToken, tokenSignature, messageJson, challengeResponse } =
        rr;
      const tokenSignatureToVerify = await signMessage(
        publishToken,
        SYSTEM_PRIVATE_KEY,
      );
      if (tokenSignature !== tokenSignatureToVerify) {
        throw new Error("Invalid token signature");
      }
      const publishTokenObject = JSON.parse(publishToken);
      if (!isPublishTokenObject(publishTokenObject)) {
        throw new Error("Invalid publish token");
      }
      const {
        timestamp,
        difficulty,
        delay,
        channel,
        senderPublicKey,
        messageSize,
        messageSignature,
      } = publishTokenObject;
      const timestampDifference = Math.abs(Date.now() - timestamp);
      if (timestampDifference < delay) {
        throw new Error("Too soon to publish");
      }
      if (timestampDifference > 60 * 1000) {
        throw new Error("Invalid timestamp for publish token");
      }
      if (messageSize !== messageJson.length) {
        throw new Error("Invalid message size");
      }
      if (!verifySignature(senderPublicKey, messageJson, messageSignature)) {
        throw new Error("Invalid message signature");
      }
      const challengeResponseStringToHash = `${publishToken}${challengeResponse}`;
      const challengeResponseSha1Bits = sha1Bits(challengeResponseStringToHash);
      if (
        challengeResponseSha1Bits.slice(0, difficulty) !==
        "0".repeat(difficulty)
      ) {
        throw new Error("Invalid challenge response");
      }
      const timestamp0 = Date.now();
      const systemSignaturePayload = JSON.stringify({
        channel,
        senderPublicKey,
        timestamp: timestamp0,
        messageSignature,
      });
      const systemSignature = await signMessage(
        systemSignaturePayload,
        SYSTEM_PRIVATE_KEY,
      );
      const m: PubsubMessage = {
        type: "message",
        senderPublicKey,
        timestamp: timestamp0,
        messageJson,
        messageSignature,
        systemSignaturePayload,
        systemSignature,
        systemPublicKey: SYSTEM_PUBLIC_KEY,
      };
      await pubnubClient.publish({
        channel,
        message: m,
      });
      const resp: PublishResponse = {
        type: "publishResponse",
        success: true,
      };
      res.status(200).json(resp);
    } catch (error) {
      res.status(500).json({ error: error.message });
      return;
    }
  },
);

export const initiateSubscribeHandler = allowCors(
  async (req: VercelRequest, res: VercelResponse) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      const rr = req.body;
      if (!isInitiateSubscribeRequest(rr)) {
        throw new Error("Invalid request");
      }
      const { channels } = rr;
      if (channels.length > 10) {
        throw new Error("Too many channels");
      }
      for (const channel of channels) {
        assertValidChannel(channel);
      }
      const subscribeTokenObject: SubscribeTokenObject = {
        timestamp: Date.now(),
        difficulty: currentSubscribeDifficulty,
        delay: currentSubscribeDelay,
        channels,
      };
      console.log("--- 1");
      const subscribeToken = JSON.stringify(subscribeTokenObject);
      console.log("--- 2");
      const tokenSignature = await signMessage(
        subscribeToken,
        SYSTEM_PRIVATE_KEY,
      );
      console.log("--- 3");
      const resp: InitiateSubscribeResponse = {
        type: "initiateSubscribeResponse",
        subscribeToken,
        tokenSignature,
      };
      res.status(200).json(resp);
    } catch (error) {
      res.status(500).json({ error: error.message });
      return;
    }
  },
);

export const subscribeHandler = allowCors(
  async (req: VercelRequest, res: VercelResponse) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      const rr = req.body;
      if (!isSubscribeRequest(rr)) {
        throw new Error("Invalid request");
      }
      const { subscribeToken, tokenSignature, challengeResponse, channels } =
        rr;
      const tokenSignatureToVerify = await signMessage(
        subscribeToken,
        SYSTEM_PRIVATE_KEY,
      );
      if (tokenSignature !== tokenSignatureToVerify) {
        throw new Error("Invalid token signature");
      }
      const subscribeTokenObject = JSON.parse(subscribeToken);
      if (!isSubscribeTokenObject(subscribeTokenObject)) {
        throw new Error("Invalid subscribe token");
      }
      const {
        timestamp,
        difficulty,
        delay,
        channels: channelsInToken,
      } = subscribeTokenObject;
      if (!stringArraysMatch(channels, channelsInToken)) {
        throw new Error("Channels do not match subscribe token");
      }
      const timestampDifference = Math.abs(Date.now() - timestamp);
      if (timestampDifference < delay) {
        throw new Error("Too soon to subscribe");
      }
      if (timestampDifference > 60 * 1000) {
        throw new Error("Invalid timestamp for subscribe token");
      }
      const challengeResponseStringToHash = `${subscribeToken}${challengeResponse}`;
      const challengeResponseSha1Bits = sha1Bits(challengeResponseStringToHash);
      if (
        challengeResponseSha1Bits.slice(0, difficulty) !==
        "0".repeat(difficulty)
      ) {
        throw new Error("Invalid challenge response");
      }

      /*
      IMPORTANT (took me a while to figure out) In pubnub, you either ENABLE or
      DiSABLE Access Manager for the key set. Two different behaviors. If it is
      enabled, then the client must have both the subscribe key and the token to
      subscribe to a channel. If it is disabled, then the cient must only have
      the subscribe key. The thing I didn't realize was that you need both of
      these things in the enabled case.

      So for this application -- make sure it is enabled!
      */

      const resources: {
        channels: { [channel: string]: GrantTokenPermissions };
      } = {
        channels: {},
      };
      for (const channel of channels) {
        resources.channels[channel] = {
          read: true,
        };
      }
      const pp: GrantTokenParameters = {
        ttl: 60, // minutes
        resources,
      };
      const pubnubToken = await pubnubClient.grantToken(pp);

      const resp: SubscribeResponse = {
        type: "subscribeResponse",
        pubnubSubscribeKey: PUBNUB_SUBSCRIBE_KEY,
        pubnubToken,
      };
      res.status(200).json(resp);
    } catch (error) {
      console.warn(error);
      res.status(500).json({ error: error.message });
      return;
    }
  },
);

const stringArraysMatch = (a: string[], b: string[]) => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

const assertValidChannel = (channel: string) => {
  // needs to be alphanumeric
  // alphanumeric plus underscore, dash, dot, and colon
  if (!/^[a-zA-Z0-9_\-:.]+$/.test(channel)) {
    throw new Error("Invalid channel");
  }
};

const assertValidMessageSize = (size: number) => {
  if (size < 1 || size > 20000) {
    throw new Error("Invalid message size");
  }
};

const sha1 = (input: string) => {
  const sha1 = crypto.createHash("sha1");
  sha1.update(input);
  return sha1.digest("hex");
};

const sha1Bits = (input: string) => {
  const hash = sha1(input);
  const bits = BigInt("0x" + hash).toString(2);
  const expectedLength = hash.length * 4;
  return bits.padStart(expectedLength, "0");
};

const verifySignature = (
  publicKeyBase64: string,
  message: string,
  signatureBase64: string,
) => {
  const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64}\n-----END PUBLIC KEY-----\n`;
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(message);
  const signature = Buffer.from(signatureBase64, "base64");
  const isValid = verifier.verify(publicKeyPem, signature);
  return isValid;
};

const signMessage = async (message: string, privateKeyBase64: string) => {
  const pem = `-----BEGIN PRIVATE KEY-----\n${privateKeyBase64}\n-----END PRIVATE KEY-----\n`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(message);
  const signature = signer.sign(pem);
  return signature.toString("base64");
};
