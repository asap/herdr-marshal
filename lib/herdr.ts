// Herdr's socket API: one newline-delimited JSON request per connection.

import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

// Only the fields marshal reads.
export type Status = 'idle' | 'working' | 'blocked' | 'done' | 'unknown';

export interface Workspace {
  workspace_id: string;
  label: string;
  active_tab_id: string;
  agent_status?: Status;
  tokens?: Record<string, string>;
  worktree?: { repo_root: string } | null;
}

export interface Pane {
  pane_id: string;
  workspace_id: string;
  tab_id: string;
  cwd?: string | null;
  agent?: string | null;
  agent_status?: Status;
}

const socketPath = () => process.env.HERDR_SOCKET_PATH ?? path.join(os.homedir(), '.config/herdr/herdr.sock');

export function call<T = unknown>(method: string, params: object = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const socket = net.connect(socketPath());
    let body = '';
    const fail = (why: string) => {
      socket.destroy();
      reject(new Error(`${method}: ${why}`));
    };
    socket.setEncoding('utf8');
    socket.setTimeout(5000, () => fail('timed out'));
    socket.on('error', (error) => fail(error.message));
    socket.on('close', () => fail('connection closed without a reply'));
    socket.on('connect', () => socket.write(`${JSON.stringify({ id: 'herdr-marshal', method, params })}\n`));
    socket.on('data', (chunk: string) => {
      body += chunk;
      const end = body.indexOf('\n');
      if (end < 0) return;
      try {
        const reply = JSON.parse(body.slice(0, end));
        if (reply.error) return fail(reply.error.message ?? JSON.stringify(reply.error));
        socket.destroy();
        resolve(reply.result);
      } catch (error) {
        fail((error as Error).message);
      }
    });
  });
}
