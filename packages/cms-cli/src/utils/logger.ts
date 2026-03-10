import pc from 'picocolors';

export const logger = {
  info: (msg: string) => console.log(pc.blue('i'), msg),
  success: (msg: string) => console.log(pc.green('✓'), msg),
  warn: (msg: string) => console.log(pc.yellow('!'), msg),
  error: (msg: string) => console.error(pc.red('x'), msg),
  log: (msg: string) => console.log(msg),
};
