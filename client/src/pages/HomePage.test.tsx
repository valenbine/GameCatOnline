import assert from 'node:assert/strict';
import test from 'node:test';
import { toSearchParams } from '../services/api';

test('toSearchParams omits empty values and keeps valid params', () => {
  const query = toSearchParams({
    page: 2,
    pageSize: 20,
    featured: true,
    search: '魂斗罗',
    sort: '',
  });

  assert.equal(query, 'page=2&pageSize=20&featured=true&search=%E9%AD%82%E6%96%97%E7%BD%97');
});
