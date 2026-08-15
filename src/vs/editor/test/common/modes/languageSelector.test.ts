/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { score, selectLanguageIds } from '../../../common/languageSelector.js';

suite('LanguageSelector', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	const model = {
		language: 'farboo',
		uri: URI.parse('file:///testbed/file.fb')
	};

	test('score, invalid selector', function () {
		assert.strictEqual(score({}, model.uri, model.language, true), 0);
		assert.strictEqual(score(undefined, model.uri, model.language, true), 0);
		assert.strictEqual(score(null!, model.uri, model.language, true), 0);
		assert.strictEqual(score('', model.uri, model.language, true), 0);
	});

	test('score, any language', function () {
		assert.strictEqual(score({ language: '*' }, model.uri, model.language, true), 5);
		assert.strictEqual(score('*', model.uri, model.language, true), 5);

		assert.strictEqual(score('*', URI.parse('foo:bar'), model.language, true), 5);
		assert.strictEqual(score('farboo', URI.parse('foo:bar'), model.language, true), 10);
	});

	test('score, default schemes', function () {

		const uri = URI.parse('git:foo/file.txt');
		const language = 'farboo';

		assert.strictEqual(score('*', uri, language, true), 5);
		assert.strictEqual(score('farboo', uri, language, true), 10);
		assert.strictEqual(score({ language: 'farboo', scheme: '' }, uri, language, true), 10);
		assert.strictEqual(score({ language: 'farboo', scheme: 'git' }, uri, language, true), 10);
		assert.strictEqual(score({ language: 'farboo', scheme: '*' }, uri, language, true), 10);
		assert.strictEqual(score({ language: 'farboo' }, uri, language, true), 10);
		assert.strictEqual(score({ language: '*' }, uri, language, true), 5);

		assert.strictEqual(score({ scheme: '*' }, uri, language, true), 5);
		assert.strictEqual(score({ scheme: 'git' }, uri, language, true), 10);
	});

	test('score, filter', function () {
		assert.strictEqual(score('farboo', model.uri, model.language, true), 10);
		assert.strictEqual(score({ language: 'farboo' }, model.uri, model.language, true), 10);
		assert.strictEqual(score({ language: 'farboo', scheme: 'file' }, model.uri, model.language, true), 10);
		assert.strictEqual(score({ language: 'farboo', scheme: 'http' }, model.uri, model.language, true), 0);

		assert.strictEqual(score({ pattern: '**/*.fb' }, model.uri, model.language, true), 10);
		assert.strictEqual(score({ pattern: '**/*.fb', scheme: 'file' }, model.uri, model.language, true), 10);
		assert.strictEqual(score({ pattern: '**/*.fb' }, URI.parse('foo:bar'), model.language, true), 0);
		assert.strictEqual(score({ pattern: '**/*.fb', scheme: 'foo' }, URI.parse('foo:bar'), model.language, true), 0);

		const doc = {
			uri: URI.parse('git:/my/file.js'),
			langId: 'javascript'
		};
		assert.strictEqual(score('javascript', doc.uri, doc.langId, true), 10); // 0;
		assert.strictEqual(score({ language: 'javascript', scheme: 'git' }, doc.uri, doc.langId, true), 10); // 10;
		assert.strictEqual(score('*', doc.uri, doc.langId, true), 5); // 5
		assert.strictEqual(score('fooLang', doc.uri, doc.langId, true), 0); // 0
		assert.strictEqual(score(['fooLang', '*'], doc.uri, doc.langId, true), 5); // 5
	});

	test('score, max(filters)', function () {
		const match = { language: 'farboo', scheme: 'file' };
		const fail = { language: 'farboo', scheme: 'http' };

		assert.strictEqual(score(match, model.uri, model.language, true), 10);
		assert.strictEqual(score(fail, model.uri, model.language, true), 0);
		assert.strictEqual(score([match, fail], model.uri, model.language, true), 10);
		assert.strictEqual(score([fail, fail], model.uri, model.language, true), 0);
		assert.strictEqual(score(['farboo', '*'], model.uri, model.language, true), 10);
		assert.strictEqual(score(['*', 'farboo'], model.uri, model.language, true), 10);
	});

	test('score hasAccessToAllModels', function () {
		const doc = {
			uri: URI.parse('file:/my/file.js'),
			langId: 'javascript'
		};
		assert.strictEqual(score('javascript', doc.uri, doc.langId, false), 0);
		assert.strictEqual(score({ language: 'javascript', scheme: 'file' }, doc.uri, doc.langId, false), 0);
		assert.strictEqual(score('*', doc.uri, doc.langId, false), 0);
		assert.strictEqual(score('fooLang', doc.uri, doc.langId, false), 0);
		assert.strictEqual(score(['fooLang', '*'], doc.uri, doc.langId, false), 0);

		assert.strictEqual(score({ language: 'javascript', scheme: 'file', hasAccessToAllModels: true }, doc.uri, doc.langId, false), 10);
		assert.strictEqual(score(['fooLang', '*', { language: '*', hasAccessToAllModels: true }], doc.uri, doc.langId, false), 5);
	});

	test('Document selector match - unexpected result value #60232', function () {
		const selector = {
			language: 'json',
			scheme: 'file',
			pattern: '**/*.interface.json'
		};
		const value = score(selector, URI.parse('file:///C:/Users/zlhe/Desktop/test.interface.json'), 'json', true);
		assert.strictEqual(value, 10);
	});

	test('Document selector match - platform paths #99938', function () {
		const selector = {
			pattern: {
				base: '/home/user/Desktop',
				pattern: '*.json'
			}
		};
		const value = score(selector, URI.file('/home/user/Desktop/test.json'), 'json', true);
		assert.strictEqual(value, 10);
	});

	test('selectLanguageIds', function () {
		const result = new Set<string>();

		selectLanguageIds('typescript', result);
		assert.deepStrictEqual([...result], ['typescript']);

		result.clear();
		selectLanguageIds({ language: 'python', scheme: 'file' }, result);
		assert.deepStrictEqual([...result], ['python']);

		result.clear();
		selectLanguageIds({ scheme: 'file' }, result);
		assert.deepStrictEqual([...result], []);

		result.clear();
		selectLanguageIds(['javascript', { language: 'css' }, { scheme: 'untitled' }], result);
		assert.deepStrictEqual([...result].sort(), ['css', 'javascript']);

		result.clear();
		selectLanguageIds('*', result);
		assert.deepStrictEqual([...result], ['*']);
	});
});
