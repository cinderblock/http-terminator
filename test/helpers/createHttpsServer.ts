import { createServer, Server } from 'https';
import { RequestListener } from 'http';
import { promisify } from 'util';
import pem, {
  CertificateCreationResult,
  CertificateCreationOptions,
} from 'pem';

const createCertificate: (
  options: CertificateCreationOptions,
) => Promise<CertificateCreationResult> = promisify(pem.createCertificate);

type HttpsServerType = {
  getConnections: () => Promise<number>;
  port?: number;
  server: Server;
  stop: () => Promise<void>;
  url?: string;
  address: ReturnType<Server['address']>;
};

export type HttpsServerFactoryType = (
  requestHandler: RequestListener,
) => Promise<HttpsServerType>;

export default async (
  requestHandler: RequestListener,
): Promise<HttpsServerType> => {
  const { serviceKey, certificate, csr } = await createCertificate({
    days: 365,
    selfSigned: true,
  });

  const httpsOptions = {
    ca: csr,
    cert: certificate,
    key: serviceKey,
  };

  const server = createServer(httpsOptions, requestHandler);

  let serverShutingDown: Promise<void>;

  const stop = (): Promise<void> => {
    if (serverShutingDown) {
      return serverShutingDown;
    }

    serverShutingDown = promisify(server.close.bind(server))();

    return serverShutingDown;
  };

  const getConnections = (): Promise<number> => {
    return promisify(server.getConnections.bind(server))();
  };

  return new Promise((resolve, reject) => {
    server.once('error', reject);

    server.listen(() => {
      const address = server.address();

      const ret: HttpsServerType = {
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
        const scheme = 'https';
        ret.url = `${scheme}://${host}:${address.port}`;
      }
      resolve(ret);
    });
  });
};
