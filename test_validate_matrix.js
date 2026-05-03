import { validateMatrixInput } from './macro/validate-matrix-input.js';

console.log('Testing validateMatrixInput');
const m1 = [{ x: 10, y: 20, z: 30 }, { x: 10, y: 20, z: 30 }];
console.log(validateMatrixInput(m1));

const m2 = [[1, 2, 3], [4, 5, 6]];
console.log(validateMatrixInput(m2));

const m3 = [[1, 2], [1, "a"]];
console.log(validateMatrixInput(m3));
