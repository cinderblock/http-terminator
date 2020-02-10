import { createServer, Server, RequestListener } from 'http';

import { promisify } from 'util';

type HttpServerType = {
  getConnections: () => Promise<number>;
  port?: number;
  server: Server;
  stop: () => Promise<void>;
  url?: string;
  address: ReturnType<Server['address']>;
};

export type HttpServerFactoryType = (
  requestHandler: RequestListener,
) => Promise<HttpServerType>;

export default (requestHandler: RequestListener): Promise<HttpServerType> => {
  const server = createServer(requestHandler);

  let serverShutingDown: Promise<void>;

  const stop = (): Promise<void> => {
    if (!serverShutingDown) {
      serverShutingDown = promisify(server.close.bind(server))();
    }

    return serverShutingDown;
  };

  const getConnections = (): Promise<number> => {
    return promisify(server.getConnections.bind(server))();
  };

  return new Promise((resolve, reject) => {
    server.once('error', reject);

    server.listen(() => {
      const address = server.address();

      const ret: HttpServerType = {
        getConnections,
        server,
        stop,
        address,
      };

      if (address === null) {
        // Do nothing
      } else if (typeof address === 'string') {
        // Do nothing
      } else {
        ret.port = address.port;
        const host = 'localhost';
        const scheme = 'http';
        ret.url = `${scheme}://${host}:${address.port}`;
      }
      resolve(ret);
    });
  });
};
