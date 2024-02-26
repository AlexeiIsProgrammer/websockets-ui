export const getRandomUUID = (): string =>
  Math.ceil(Math.random() * 10000).toString();

export const getRandomNumber = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};
