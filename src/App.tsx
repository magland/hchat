import { useEffect, useReducer, useState } from "react";
import { HchatClient, generateKeyPair } from "./HchatClient/HchatClient";
import { PubsubMessage } from "./types";

type MessagesState = PubsubMessage[];

type MessagesAction = {
  type: "add";
  message: PubsubMessage;
};

const messagesReducer = (
  state: MessagesState,
  action: MessagesAction,
): MessagesState => {
  switch (action.type) {
    case "add": {
      const mm = state.find(
        (m) => m.systemSignature === action.message.systemSignature,
      );
      if (mm) {
        return state;
      }
      return [...state, action.message].sort(
        (a, b) => a.timestamp - b.timestamp,
      );
    }
    default:
      return state;
  }
};

function App() {
  const [messages, messagesDispatch] = useReducer(messagesReducer, []);
  const [client, setClient] = useState<HchatClient | null>(null);
  useEffect(() => {
    (async () => {
      const { publicKey, privateKey } = await generateKeyPair();
      const client = new HchatClient(publicKey, privateKey, (e) => {
        if (e.type === "message") {
          messagesDispatch({ type: "add", message: e });
        }
      });
      client.subscribeToChannels(["channel1a"]);
      setClient(client);
      await sleep(1000);
      client.publish(
        "channel1a",
        "Hello channel1a from client1 --- " + Math.random(),
      );
    })();
  }, []);
  return (
    <div>
      <h1>Hchat test</h1>
      <p>
        <button
          onClick={() => {
            generateKeyPair().then(({ publicKey, privateKey }) => {
              console.log("publicKey", publicKey);
              console.log("privateKey", privateKey);
            });
          }}
        >
          Generate key pair in developer console
        </button>
      </p>
      <div>
        <h3>Send message</h3>
        <input type="text" placeholder="Message" id="message" name="message" />
        <button
          onClick={() => {
            if (client) {
              const message = (
                document.getElementById("message") as HTMLInputElement
              ).value;
              client.publish("channel1a", message);
            }
          }}
        >
          Send message
        </button>
      </div>
      <div>
        <h3>Messages</h3>
        {messages.map((m, i) => {
          const msg = JSON.parse(m.messageJson);
          return (
            <div key={i}>
              <hr />
              <p>
                Sender: {m.senderPublicKey.slice(10)}; Timestamp: {m.timestamp}
              </p>
              <p>Message: {msg}</p>
              <hr />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// const test = async (onText: (text: string) => void) => {
//   await sleep(100)
//   const { publicKey: publicKey1, privateKey: privateKey1 } = await generateKeyPair();
//   const { publicKey: publicKey2, privateKey: privateKey2 } = await generateKeyPair();
//   onText("Creating client1");
//   const client1 = new HchatClient(publicKey1, privateKey1, (e) => {
//     const { channel, message } = e;
//     onText(`Client 1 received message on channel ${channel}: ${message}`);
//     if (message.startsWith('Hello channel1a')) {
//       client1.publish("channel1a", "Client1 responding to message on channel1a from client2: " + message);
//     }
//   }, {verbose: true});
//   onText("Subscribing to channel1a");
//   await client1.subscribeToChannels(["channel1a"]);
//   onText("Creating client2");
//   const client2 = new HchatClient(publicKey2, privateKey2, (x) => {
//     const { channel, message } = x;
//     onText(`Client 2 received message on channel ${channel}: ${message}`);
//   }, {verbose: true});
//   onText("Subscribing to channel1a");
//   await client2.subscribeToChannels(["channel1a"]);

//   onText("Client1 publishing message to channel1a");
//   client2.publish("channel1a", "Hello channel1a from client2 " + Math.random());
// }

const sleep = (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export default App;
