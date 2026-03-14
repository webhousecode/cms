import pc from 'picocolors';

function noop() {}

export const logger = {
  silent: false,
  info: (msg: string) => { if (!logger.silent) console.log(pc.blue('i'), msg); },
  success: (msg: string) => { if (!logger.silent) console.log(pc.green('✓'), msg); },
  warn: (msg: string) => { if (!logger.silent) console.log(pc.yellow('!'), msg); },
  error: (msg: string) => { if (!logger.silent) console.error(pc.red('x'), msg); },
  log: (msg: string) => { if (!logger.silent) console.log(msg); },
};
