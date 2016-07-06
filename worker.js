require('dotenv').config({ silent: true });
var Consumer = require('sqs-consumer');
var AWS = require('aws-sdk');
var request = require('request');

AWS.config.update({region: process.env.AWS_REGION});
var sqs = new AWS.SQS();

var handleMessage = function(message, done) {
  var id = message.MessageId;
  var body = JSON.parse(message.Body);
  request.post('https://slack.com/api/chat.postMessage', {
    qs: {
      as_user: true,
      token: body.reaction_fields.token,
      channel: body.reaction_fields.channel,
      text: body.reaction_fields.text
    }
  }, function (err, res, body) {
    if (err) {
      return console.error(err)
    }
    console.log('sent message: ', body);
    done();
  });
};

sqs.getQueueUrl({ QueueName: 'slack-channel' }, function(err, data) {
  var app = Consumer.create({
    queueUrl: data.QueueUrl,
    handleMessage: handleMessage,
    sqs: sqs
  });

  app.on('error', function (err) {
    console.log(err.message);
  });

  app.start();
});
