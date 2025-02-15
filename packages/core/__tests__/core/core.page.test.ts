/* tslint:disable:no-empty no-string-literal */
import xhrMock from 'xhr-mock';
import { init } from '../../__mocks__/barba';
import barba from '../../src';
import { hooks } from '../../src/hooks';
import { schemaAttribute } from '../../src/schemas/attribute';

// Needed for "request" module
(global as any).Headers = class {};

const namespace = 'next';
const checkDoc = new RegExp(
  `^<html>[\\s\\S]+body[\\s\\S]+${schemaAttribute.wrapper}[\\s\\S]+${schemaAttribute.container}[\\s\\S]+${namespace}[\\s\\S]+</html>$`
);
const t = { leave() {}, enter() {} };
const sameUrl = 'http://localhost/';
const nextUrl = 'http://localhost/foo';

init();

let spyCacheHas: jest.SpyInstance;
let spyCacheGet: jest.SpyInstance;
let spyCacheSet: jest.SpyInstance;
let spyCacheUpdate: jest.SpyInstance;
let spyCacheGetAction: jest.SpyInstance;
let spyPage: jest.SpyInstance;

const sameHtml = `<html>
<head>
  <title>Current page</title>
</head>
<body>
  <div data-barba="wrapper">
    <div data-barba="container" data-barba-namespace="current"></div>
  </div>
</body>
</html>`;

beforeEach(() => {
  barba.init();
  xhrMock.setup();
  xhrMock.get(sameUrl, (req, res) => res.status(200).body(sameHtml));
  xhrMock.get(nextUrl, (req, res) =>
    res.status(200).body(`<html>
    <head>
      <title>New page</title>
    </head>
    <body>
      <div data-barba="wrapper">
        <div data-barba="container" data-barba-namespace="${namespace}"></div>
      </div>
    </body>
  </html>`)
  );

  spyCacheHas = jest.spyOn(barba.cache, 'has');
  spyCacheGet = jest.spyOn(barba.cache, 'get');
  spyCacheSet = jest.spyOn(barba.cache, 'set');
  spyCacheUpdate = jest.spyOn(barba.cache, 'update');
  spyCacheGetAction = jest.spyOn(barba.cache, 'getAction');
  spyPage = jest.spyOn(barba.transitions, 'doPage');
});
afterEach(() => {
  spyCacheHas.mockRestore();
  spyCacheGet.mockRestore();
  spyCacheSet.mockRestore();
  spyCacheUpdate.mockRestore();
  spyCacheGetAction.mockRestore();
  spyPage.mockRestore();
  xhrMock.teardown();
  barba.destroy();
});

it('do page', async () => {
  barba.history.update = jest.fn();
  hooks.do = jest.fn();

  barba.transitions.store.add('transition', t);
  const data = {
    ...barba.data,
    trigger: 'barba',
  };

  await barba.page(nextUrl, 'barba', false);

  expect(spyCacheHas).toHaveBeenCalledTimes(1);
  expect(spyCacheSet).toHaveBeenCalledTimes(1);
  expect(barba.history.update).toHaveBeenCalledTimes(1);
  expect(hooks.do).toHaveBeenNthCalledWith(1, 'page', data);
  expect(hooks.do).toHaveBeenNthCalledWith(2, 'before', data, t);
  expect(hooks.do).toHaveBeenNthCalledWith(3, 'beforeLeave', data, t);
  expect(hooks.do).toHaveBeenNthCalledWith(4, 'leave', data, t);
  expect(hooks.do).toHaveBeenNthCalledWith(5, 'afterLeave', data, t);
  expect(hooks.do).toHaveBeenNthCalledWith(6, 'nextAdded', data);
  expect(hooks.do).toHaveBeenNthCalledWith(7, 'beforeEnter', data, t);
  expect(hooks.do).toHaveBeenNthCalledWith(8, 'enter', data, t);
  expect(hooks.do).toHaveBeenNthCalledWith(9, 'afterEnter', data, t);
  expect(hooks.do).toHaveBeenNthCalledWith(10, 'after', data, t);
  expect(hooks.do).toHaveBeenNthCalledWith(11, 'currentRemoved', data);
  expect(barba.transitions.doPage).toHaveBeenCalledTimes(1);
  expect(document.title).toBe('New page');
});

// it('do page [popstate]', async () => {
//   barba.transitions.doPage = jest.fn();
//   barba.history.add = jest.fn();

//   barba.transitions.store.add('transition', { leave() {}, enter() {} });
//   await barba.page(nextUrl, 'popstate', false);

//   expect(barba.history.add).toHaveBeenCalledTimes(1);
// });

it('do page [has cache]', async () => {
  barba.history.add = jest.fn();
  barba.cache.set(sameUrl, Promise.resolve(sameHtml), 'init');
  spyCacheSet.mockRestore();

  // NOTE: as we use "same URL" (localhost), we need a "self" transition
  // to avoid prevent "sameURL"
  barba.transitions.store.add('transition', { name: 'self' });
  barba.transitions.store.add('transition', { leave() {}, enter() {} });
  await barba.page(sameUrl, 'barba', false);

  expect(spyCacheHas).toHaveBeenCalledTimes(1);
  expect(spyCacheUpdate).toHaveBeenCalledTimes(1);
  expect(spyCacheSet).toHaveBeenCalledTimes(0);
});

it('do page [waiting]', async () => {
  // Avoid updating data.next
  barba['_resetData'] = jest.fn();

  barba.transitions.store.add('transition', {
    leave() {},
    enter() {},
    to: { namespace: 'ns' },
  });
  await barba.page(nextUrl, 'barba', false);

  expect(barba.data.next.html).toMatch(checkDoc);
});

it('catches error', async () => {
  expect.assertions(2);
  barba.logger.error = jest.fn();
  barba.transitions.logger.error = jest.fn();
  barba.history.cancel = jest.fn();
  spyPage.mockRestore();
  const errorLeave = new Error('Transition error [page][leave]');
  const errorTransition = new Error('Transition error');

  barba.transitions.store.add('transition', {
    leave() {
      throw errorLeave;
    },
  });

  await barba.page(nextUrl, 'barba', false);

  expect(barba.transitions.logger.error).toHaveBeenCalledWith(errorLeave);
  expect(barba.logger.error).toHaveBeenCalledWith(errorTransition);
  // expect(spyCacheGetAction).toHaveBeenCalledTimes(1);
});
