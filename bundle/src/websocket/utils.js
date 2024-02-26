"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRandomIntInRange = exports.uuidv4 = void 0;
const uuidv4 = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0, v = c == 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};
exports.uuidv4 = uuidv4;
const getRandomIntInRange = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};
exports.getRandomIntInRange = getRandomIntInRange;
