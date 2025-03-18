import dotenv from 'dotenv';
dotenv.config();
const ngrokDomain = process.env.NGROK_DOMAIN;
const zendesk_subdomain = process.env.ZENDESK_SUBDOMAIN;
const zendesk_apikey = process.env.ZENDESK_KEY;
const jira_subdomain = process.env.JIRA_SUBDOMAIN;
const jira_apikey = process.env.JIRA_KEY;
const jirabot_id = process.env.ZENDESK_JIRABOT_AUTHOR_ID;

import ngrok from '@ngrok/ngrok'
import http from 'http';
import axios from 'axios';

//This app is pinged when any Zendesk ticket is Solved and it has data in the custom Jira ticket field
//It checks if any Jira ticket is open, and if so, reopens the Zendesk ticket
//The goal is to prevent closing Zendesk tickets without fully resolving the related Jira ticket
//This will allow us to report accurately on the Jira tickets that need updates

//Using a static Ngrok domain to receive data from the Zendesk Webhook
(async function() {
  // Establish connectivity
  const listener = await ngrok.forward({ addr: 3001, authtoken_from_env: true, domain: ngrokDomain});

  // Output ngrok url to console
  console.log(`Ingress established at: ${listener.url()}`);
})();


process.stdin.resume();

//Create listener on Port 3001 to recieve data from ngrok
const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let data = '';
    req.on('data', chunk => {
        data += chunk.toString();
    });
    req.on('end', () => {

      //check if data is in request
      if (data) {

        //split data from webhook into ticket ID and Jira ticket numbers from custom field
        const solvedZendeskTicketData = JSON.parse(data);
        const jiraTicketsFromZendesk = solvedZendeskTicketData.jira_tickets; //string
        const zendeskTicketID = solvedZendeskTicketData.zendesk_ticket_id;

        //Check Jira for the ticket numbers sent over from Zendesk
        queryJira(jiraTicketsFromZendesk)
          .then(jiraData => {
            jiraData = JSON.parse(jiraData);
            console.log(jiraData);
            //if any relevant Jira tickets are not closed, reopen the Zendesk ticket
            if (jiraData.openTickets.length != 0) {
              console.log("Jira tickets are open: " + jiraData.openTickets)
              reopenZendeskTicket(zendeskTicketID, jiraData.openTickets);
            }
            res.end("jiraData is: " + jiraData);
          })
      } else {
        res.end(`No data recieved`);
      }
       
    });
  } else {
    res.end('Send a POST request to this endpoint');
  }
});

server.listen(3001, () => {
  console.log('Server running on port 3001');
});

//---------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------

//Validates the custom field input from Zendesk. This is currently set to only check for CD project tickets.
function validateInput(input) {
  const re = /(CD-\d{4,5})/g;
  const matches = input.match(re);
  console.log(JSON.stringify(matches));
  return matches;
}

//---------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------

//Calls the Jira API to verify that all relavent tickets are closed
async function queryJira(jiraTicketNumbers) {

//validate input
jiraTicketNumbers = validateInput(jiraTicketNumbers).toString();

//set API call params
const config = {
    method: 'GET',
    url: `https://${jira_subdomain}.atlassian.net/rest/api/3/search/jql?jql=issuekey%20IN%20%28${jiraTicketNumbers}%29%20AND%20project%20IN%20%28"CONNECT%20Development"%29&fields=status&maxResults=1000`,
    headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${Buffer.from(jira_apikey).toString('base64')}`,
    }
  };

//Call Jira API
return axios(config)
  .then(function (response) {
    return JSON.stringify(response.data);
  })
  .then(text => {

    //ticket data returned from Jira
    const tickets = JSON.parse(text).issues;

    //store unsolved ticket numbers
    const unsolvedTickets = [];

    //read ticket fields
    for (let i=0; i<tickets.length; i++) {

      //if there is data in the fields
      if(tickets[i].fields){

        //and the status is not closed, add the unsolved ticket to the list
        if (tickets[i].fields.status.name != "Closed") {
        unsolvedTickets.push(tickets[i].key); 
        }
      }
    }
    //return unsolved Jira tickets
    return JSON.stringify({"openTickets":unsolvedTickets});
  })
  .catch(function (error) {
    console.log(error);
  });
}

//---------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------

//Call the Zendesk API to reopen the ticket and post a comment with the related open Jira ticket(s)
function reopenZendeskTicket(zendeskTicketID, openJiraTickets){

  //set comment and status data
  const data = JSON.stringify({
    "ticket": {
      "comment": {
        "body": `The following linked Jira tickets are not closed: ${openJiraTickets} Please ensure that all Jira tickets are closed before closing the Zendesk Ticket.`,
        "public": false,
        "author_id": jirabot_id
      },
      "custom_status_id": 321,
      "status": "open"
    }
  });
  
  //set API call params
  const config = {
    method: 'PUT',
    url: `https://${zendesk_subdomain}.zendesk.com/api/v2/tickets/${zendeskTicketID}`,
    headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${Buffer.from(zendesk_apikey).toString('base64')}`,
    },
    data : data,
  };
  
  //Call Zendesk API
  axios(config)
  .then(function (response) {
    console.log(JSON.stringify(response.data));
  })
  .catch(function (error) {
    console.log(error);
  });
}