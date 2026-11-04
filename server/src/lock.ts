let chain: Promise<void> = Promise.resolve();

export const enqueue = <T>(task: () => Promise<T> | T): Promise<T> => {
  const run = chain.then(() => task());
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};
