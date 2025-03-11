import dotenv from 'dotenv';
dotenv.config();
const ngrokDomain = process.env.NGROK_DOMAIN;
const zendesk_subdomain = process.env.ZENDESK_SUBDOMAIN;
const zendesk_apikey = process.env.ZENDESK_KEY;
const jira_subdomain = process.env.JIRA_SUBDOMAIN;
const jira_apikey = process.env.JIRA_KEY;
const jirabot_id = process.env.ZENDESK_JIRABOT_AUTHOR_ID;

import fetch from 'node-fetch'
import ngrok from '@ngrok/ngrok'
import http from 'http';
import axios from 'axios';

//Using a static Ngrok domain to receive data from slack slash commands
(async function() {
  // Establish connectivity
  const listener = await ngrok.forward({ addr: 3000, authtoken_from_env: true, domain: ngrokDomain});

  // Output ngrok url to console
  console.log(`Ingress established at: ${listener.url()}`);
})();


process.stdin.resume();


const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let data = '';
    req.on('data', chunk => {
        data += chunk.toString();
    });
    req.on('end', () => {
      if (data) {
        const solvedZendeskTicketData = JSON.parse(data);
        
        const searchParams = new URLSearchParams(data);
        const postData = searchParams.get("text");
        console.log(solvedZendeskTicketData);
        const jiraTicketsFromZendesk = solvedZendeskTicketData.jira_tickets;
        console.log(jiraTicketsFromZendesk);
        const zendeskTicketID = solvedZendeskTicketData.zendesk_ticket_id;
        console.log(zendeskTicketID);
        queryJira(jiraTicketsFromZendesk)
          .then(jiraData => {
            console.log("Ending Res: " + jiraData);
            jiraData = JSON.parse(jiraData);
            if (!jiraData.allClosed) {
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

server.listen(3000, () => {
  console.log('Server running on port 3000');
});

//---------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------

async function queryJira(jiraTicketNumbers) {
console.log(jiraTicketNumbers);
jiraTicketNumbers = validateInput(jiraTicketNumbers).toString();
console.log(jiraTicketNumbers);
  return fetch(`https://${jira_subdomain}.atlassian.net/rest/api/3/search/jql?jql=issuekey%20IN%20%28${jiraTicketNumbers}%29%20AND%20project%20IN%20%28"CONNECT%20Development"%29&fields=status&maxResults=1000`, {

  method: 'GET',
  headers: {
    'Authorization': `Basic ${Buffer.from(jira_apikey).toString('base64')}`,
    'Accept': 'application/json'
  }
})
  .then(response => {
    console.log(
      `Response: ${response.status} ${response.statusText}`
    );
    //console.log(response.json());
    return response.text();
  })
  .then(text => {
    let closedCount = 0;
    const tickets = JSON.parse(text).issues;
    const unsolvedTickets = [];
    console.log(tickets);
    console.log(`# of tickets from Zendesk: ${tickets.length}`)
    for (let i=0; i<tickets.length; i++) {
      if(tickets[i].fields){
        console.log(`Ticket: ${tickets[i].key} Status: ${tickets[i].fields.status.name}`);
        if (tickets[i].fields.status.name === "Closed") {
        closedCount++;
        } else {
          unsolvedTickets.push(tickets[i].key);
        }
      }
      
    }
    console.log(`closed count: ${closedCount}`);
    console.log(tickets.length === closedCount);
    return JSON.stringify({"allClosed":tickets.length === closedCount,"openTickets":unsolvedTickets});
  })
  .catch(err => console.error(err));
}

//---------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------

function reopenZendeskTicket(zendeskTicketID, openJiraTickets){

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
  
  const config = {
    method: 'PUT',
    url: `https://${zendesk_subdomain}.zendesk.com/api/v2/tickets/${zendeskTicketID}`,
    headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${Buffer.from(zendesk_apikey).toString('base64')}`,
    },
    data : data,
  };
  
  axios(config)
  .then(function (response) {
    console.log(JSON.stringify(response.data));
  })
  .catch(function (error) {
    console.log(error);
  });
}

function validateInput(input) {
  const re = /(CD-\d{4,5})/g;
  const matches = input.match(re);
  console.log(JSON.stringify(matches));
  return matches;
}


//zendeskQuery(28);

 
 //35233393542292 - custom SB Jira Number field

 //Searching for onhold tickets
 /*
 .then(text => {
	let tickets = JSON.parse(text).results
	//console.log(JSON.stringify(tickets) + "Type: " + typeof tickets)
	const onHoldTickets = [];
	for (let i=0;i<tickets.length;i++) {
		console.log(tickets[i].status);
		if(tickets[i].status == "hold") {
			let jiraTickets = "";
			let customFields = tickets[i].custom_fields;
			for (let j=0;j<customFields.length;j++){
				//console.log("custom field: " + JSON.stringify(customFields[i]));
				//console.log("custom field id: " + customFields[i].id);
				console.log("custom field id == 35233393542292: " + (customFields[j].id == 35233393542292));
				if (customFields[j].id == 35233393542292) {
					jiraTickets = customFields[j].value;
					console.log("JIRA: " + jiraTickets);
				}
			}
			console.log("jiraTickets below: " + jiraTickets);
			onHoldTickets.push({"jira_tickets":jiraTickets, "zendesk_ticket":tickets[i].id});
		}
	}
    console.log(JSON.stringify(onHoldTickets));
  })
    */
