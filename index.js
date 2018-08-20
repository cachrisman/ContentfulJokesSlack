'use strict';

const AWS = require('aws-sdk');
const qs = require('querystring');
const contentful = require('contentful');

const kmsEncryptedToken = process.env.kmsEncryptedToken;
const encryptedSpaceId = process.env.spaceId
const encryptedAccessToken = process.env.accessToken
let token;
let spaceId
let accessToken

const contentfulClient = contentful.createClient({
  space: process.env.spaceId,
  accessToken: process.env.accessToken
})

function processEvent(event, callback) {
  console.log('processEvent')
  const params = qs.parse(event.body);
  const requestToken = params.token;

  if (requestToken !== token) {
    console.error(`Request token (${requestToken}) does not match expected`);
    return callback(`Invalid request token ${token} ${requestToken}`);
  }

  const user = params.user_name;
  const command = params.command;
  const channel = params.channel_name;
  const sport = params.text;

  console.log('sport:', sport)

  contentfulClient.getEntries({
    content_type: 'joke',
    'fields.sport.sys.contentType.sys.id': 'sport',
    'fields.sport.fields.name[match]': sport
  }).then(data => {
    let joke
    if (data.items.length) joke = data.items[Math.floor(Math.random() * data.items.length)].fields
    else joke = { body: "sorry no joke for you" }
    console.log(`Here's a joke about ${sport}: ${joke}`)
    callback(null, `Here's a joke about ${sport}: ${joke}`);
  }).catch(err => {
    console.log('error:', err)
  })
}

exports.handler = (event, context, callback) => {
  const done = (err, res) => callback(null, {
    statusCode: err ? '400' : '200',
    body: err ? (err.message || err) : JSON.stringify(res),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (token && spaceId && accessToken) {
    processEvent(event, done);
  } else if (kmsEncryptedToken && encryptedSpaceId && encryptedAccessToken) {
    let cipherText = { CiphertextBlob: new Buffer(kmsEncryptedToken, 'base64') };
    const kms = new AWS.KMS();
    kms.decrypt(cipherText, (err, data) => {
      if (err) {
        console.log('Decrypt error:', err);
        return done(err);
      }
      token = data.Plaintext.toString('ascii');

      cipherText = { CiphertextBlob: new Buffer(encryptedSpaceId, 'base64') };
      kms.decrypt(cipherText, (err, data) => {
        if (err) {
          console.log('spaceId decrypt error:', err);
        }
        spaceId = data.Plaintext.toString('ascii');
        console.log('spaceId:', spaceId)
        cipherText = { CiphertextBlob: new Buffer(encryptedAccessToken, 'base64') };
        kms.decrypt(cipherText, (err, data) => {
          if (err) {
            console.log('accessToken decrypt error:', err);
          }
          accessToken = data.Plaintext.toString('ascii');
          console.log('accessToken:', accessToken)
          processEvent(event, done);
        });
      });
    })

  } else {
    done('Token has not been set.');
  }
};
