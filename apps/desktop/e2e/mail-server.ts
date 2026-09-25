import { generate } from 'selfsigned';
import { SMTPServer } from 'smtp-server';
import type { AddressInfo } from 'node:net';

export interface ReceivedEmail {
  from: string | undefined;
  to: string[];
  raw: string;
}

export interface TestMailServer {
  port: number;
  /** PEM of the test CA that signed the server's certificate. */
  caPem: string;
  received: ReceivedEmail[];
  close(): Promise<void>;
}

/**
 * A real SMTP server on localhost that requires STARTTLS and a password,
 * with a certificate from a throwaway CA. The app trusts that CA only
 * through POSTLOOM_TEST_EXTRA_CA_FILE, which packaged builds ignore.
 */
export async function startTestMailServer(credentials: {
  username: string;
  password: string;
}): Promise<TestMailServer> {
  const ca = await generate([{ name: 'commonName', value: 'Postloom Test CA' }], {
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: true, critical: true },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    ],
  });
  const leaf = await generate([{ name: 'commonName', value: 'localhost' }], {
    keySize: 2048,
    algorithm: 'sha256',
    ca: { key: ca.private, cert: ca.cert },
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '::1' },
        ],
      },
    ],
  });

  const received: ReceivedEmail[] = [];
  const server = new SMTPServer({
    secure: false,
    key: leaf.private,
    cert: leaf.cert,
    authMethods: ['PLAIN', 'LOGIN'],
    // Refuse to sign in over an unencrypted connection, like real providers.
    allowInsecureAuth: false,
    disabledCommands: [],
    logger: false,
    onAuth(auth, _session, callback) {
      if (auth.username === credentials.username && auth.password === credentials.password) {
        callback(null, { user: auth.username });
      } else {
        callback(new Error('Invalid username or password'));
      }
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        const from = session.envelope.mailFrom;
        received.push({
          from: from ? from.address : undefined,
          to: session.envelope.rcptTo.map((rcpt) => rcpt.address),
          raw: Buffer.concat(chunks).toString('utf8'),
        });
        callback();
      });
    },
  });

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  const { port } = server.server.address() as AddressInfo;

  return {
    port,
    caPem: ca.cert,
    received,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}
