import http from 'http';
import { Socket as NodeSocket } from 'net';
import delay from 'delay';
import {
  HttpTerminatorConfigurationInputType,
  InternalHttpTerminatorType,
} from '../types';
import Logger from '../Logger';

const log = Logger.child({
  namespace: 'createHttpTerminator',
});

const configurationDefaults = {
  gracefulTerminationTimeout: 1000,
};

// TODO: Improve this type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Socket = NodeSocket & { server: http.Server; _httpMessage: any };

export default (
  configurationInput: HttpTerminatorConfigurationInputType,
): InternalHttpTerminatorType => {
  const configuration = {
    ...configurationDefaults,
    ...configurationInput,
  };

  const server = configuration.server;

  const sockets = new Set<Socket>();
  const secureSockets = new Set<Socket>();

  let terminating: Promise<void>;

  server.on('connection', (socket: Socket) => {
    if (terminating) {
      socket.destroy();
    } else {
      sockets.add(socket);

      socket.once('close', () => {
        sockets.delete(socket);
      });
    }
  });

  server.on('secureConnection', (socket: Socket) => {
    if (terminating) {
      socket.destroy();
    } else {
      secureSockets.add(socket);

      socket.once('close', () => {
        secureSockets.delete(socket);
      });
    }
  });

  /**
   * Evaluate whether additional steps are required to destroy the socket.
   *
   * @see https://github.com/nodejs/node/blob/57bd715d527aba8dae56b975056961b0e429e91e/lib/_http_client.js#L363-L413
   */
  const destroySocket = (socket: Socket): void => {
    socket.destroy();

    sockets.delete(socket);
  };

  const terminate = async (): Promise<void> => {
    if (terminating) {
      log.warn('already terminating HTTP server');

      return terminating;
    }

    let resolveTerminating: () => void;
    let rejectTerminating: (e: Error) => void;

    terminating = new Promise((resolve, reject) => {
      resolveTerminating = resolve;
      rejectTerminating = reject;
    });

    server.on('request', (incomingMessage, outgoingMessage) => {
      if (!outgoingMessage.headersSent) {
        outgoingMessage.setHeader('connection', 'close');
      }
    });

    for (const socket of sockets) {
      // This is the HTTP CONNECT request socket.
      if (!(socket.server instanceof http.Server)) {
        continue;
      }

      // $FlowFixMe
      const serverResponse = socket._httpMessage;

      if (serverResponse) {
        if (!serverResponse.headersSent) {
          serverResponse.setHeader('connection', 'close');
        }

        continue;
      }

      destroySocket(socket);
    }

    for (const socket of secureSockets) {
      // $FlowFixMe
      const serverResponse = socket._httpMessage;

      if (serverResponse) {
        if (!serverResponse.headersSent) {
          serverResponse.setHeader('connection', 'close');
        }

        continue;
      }

      destroySocket(socket);
    }

    if (sockets.size) {
      await delay(configuration.gracefulTerminationTimeout);

      for (const socket of sockets) {
        destroySocket(socket);
      }
    }

    server.close(error => {
      if (error) {
        rejectTerminating(error);
      } else {
        resolveTerminating();
      }
    });

    return terminating;
  };

  return {
    secureSockets,
    sockets,
    terminate,
  };
};
