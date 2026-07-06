// test-expo-sdk.js
// Smoke test del SDK Expo Push.

const { Expo } = require('expo-server-sdk');

try {
  const c = new Expo();
  console.log('Expo SDK cargado OK.');
  console.log('Tipo:', c.constructor.name);
  const proto = Object.getPrototypeOf(c);
  const methods = Object.getOwnPropertyNames(proto);
  console.log('Métodos públicos (primeros 10):', methods.slice(0, 10));

  // Test de chunkPushNotifications (no envía, solo formatea)
  const msgs = [
    { to: 'ExponentPushToken[fake]', title: 'test', body: 'hola' },
  ];
  const chunks = c.chunkPushNotifications(msgs);
  console.log('chunkPushNotifications OK, chunks:', chunks.length);
} catch (err) {
  console.error('ERROR:', err.message);
  process.exit(1);
}