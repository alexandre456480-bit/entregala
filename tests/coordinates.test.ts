import {test} from 'node:test';import assert from 'node:assert/strict';import {parseCoordinate,parseCoordinatePair} from '../shared/coordinates';
test('coordenadas manuais aceitam ponto/vírgula e mantêm graus decimais',()=>{assert.equal(parseCoordinate('-16.62670140003006',90),-16.6267014);assert.equal(parseCoordinate(' -49,204844770691174 ',180),-49.2048448);assert.equal(parseCoordinate('0',90),0);assert.equal(parseCoordinate('−49.25',180),-49.25);});
test('coordenadas incompletas ou fora da faixa nunca são adivinhadas',()=>{for(const value of ['','-','texto','-49204844770691174','1.234,567','1e2','Infinity'])assert.equal(parseCoordinate(value,180),null);assert.equal(parseCoordinate('91',90),null);assert.equal(parseCoordinate('-181',180),null);});
test('par de coordenadas aceita separação clara sem interpretar formatos ambíguos',()=>{
 for(const value of ['-16.6267014, -49.2048448','-16.6267014,-49.2048448','-16.6267014 -49.2048448','-16,6267014 -49,2048448'])
  assert.deepEqual(parseCoordinatePair(value),{latitude:-16.6267014,longitude:-49.2048448});
 for(const value of ['','-16.6','-16,62,-49,20','-91, -49','-16, -181','-16.6, -49204844770691174','-16.6, -49.2, 5'])assert.equal(parseCoordinatePair(value),null);
});
