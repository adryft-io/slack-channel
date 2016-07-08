require('dotenv').config({ silent: true });
var Consumer = require('sqs-consumer');
var AWS = require('aws-sdk');
var request = require('request');
var Botkit = require('botkit');

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
      return console.error(err);
    }
    console.log('sent message: ', body);
    done();
  });
};

sqs.getQueueUrl({ QueueName: 'slack-channel' }, function(err, data) {
  if (err) return console.error(err);

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

var token = process.env.SLACK_BOT_TOKEN;

var controller = Botkit.slackbot();
var bot = controller.spawn({
  token: token
});

bot.startRTM(function(err,bot,payload) {
  if (err) {
    console.error(err);
    throw new Error('Could not connect to Slack');
  }
  console.log('Connected to Slack!');
});

var getUserName = function(id) {
  return new Promise(function(resolve, reject) {
    request.get('https://slack.com/api/users.info', {
      qs: {
        token: token,
        user: id
      },
      json: true
    }, function(err, res, body) {
      if(err) {
        return reject(err);
      }

      if(typeof body.user === 'undefined' || typeof body.user.name === 'undefined') {
        return reject(res);
      }

      return resolve(body.user.name);
    });
  });
}

var getSlackBotActionFormulae = function() {
  return new Promise(function(resolve, reject) {
    request(process.env.FORMULAE_SERVICE_URL + '/v1/formulae' ,{
      qs: {
        action_channel: 'slackbot'
      },
      json: true
    }, function(err, res, body) {
      if(err) {
        return reject(err);
      }

      if(typeof body.data === 'undefined') {
        return reject(res);
      }

      return resolve(body.data);
    });
  });
}

controller.hears([/\b(wemo)\b/i], 'direct_message,direct_mention,mention', function(bot, message) {
  console.log(message);

  getUserName(message.user)
  .then(function(userName) {
    getSlackBotActionFormulae()
    .then(function(formulae) {
      var found;
      formulae.forEach(function(formula) {
        console.log(userName, formula.action_fields.name);
        if (userName === formula.action_fields.name) {
          found = formula;
        }
      });

      if (!found) {
        return bot.reply(message, 'sorry but I couldn\'t find any relavent formulae for you');
      }

      sqs.getQueueUrl({ QueueName: 'action' }, function(err, data) {
        var queue = new AWS.SQS({ params: { QueueUrl: data.QueueUrl } });
        var body = JSON.stringify({
          action_channel: 'slackbot',
          action_name: 'message',
          action_props: {
            message: message.match.input
          },
          user_id: found.user_id
        });
        console.log(body);

        queue.sendMessage({ MessageBody: body }, function (err, data) {
          if (err) return console.log(err);
          bot.reply(message, 'doing it now');
          console.log('sent message: ' + data.MessageId);
        });
      });
    }).catch(function(err) { console.error(err); });
  }).catch(function(err) { console.error(err); });
});
