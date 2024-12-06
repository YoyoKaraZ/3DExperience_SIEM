const stompit = require('stompit');
const WebSocket = require('ws');
const axios = require('axios');




// Define the base URL and document path
const baseUrl = "https://R1132102747346-eu1-space.3dexperience.3ds.com/enovia";
const documentPath = "/resources/v1/modeler/documents/A8FB660E096A25006751EE34000009B1";
const securityContext = "VPLMCreator.Company Name.Common Space";


const login = 'b3935f56-98da-4d38-ab19-6a44660cdb11'; // Replace with actual login
const password = '$h~$7p4!:q=LtCuNHqG4G%q"'; // Replace with actual password


const loginAndPassword = `${login}:${password}`;
const base64EncodedString = Buffer.from(loginAndPassword).toString('base64');

const basicAuthentication = `Basic ${base64EncodedString}`;

async function fetchDocument(relativePath, source) {
  try {
    const response = await axios.get(`${source}${relativePath}`, {
      headers: {
        'Authorization': basicAuthentication, // Replace with your actual token
        'Security-Context': securityContext,
        'Accept': 'application/json'
      }
    });

    // Access `data` array in the response
    const documentData = response.data.data;

    /*if (documentData && documentData.length > 0) {
      documentData.forEach((item) => {
        // Access the title from dataelements
        const title = item.dataelements?.title;
        // console.log('Title:', title);
        // Add the title to the subject under data in the original jsonMessage
        return title;
      });      
    } else {
      console.log('No document data found.');
      return null;
    }*/

    if (documentData && documentData.length > 0) {
      const title = documentData[0]?.dataelements?.title; // Get the title from the first item
      return title || null; // Return title or null if not found
    } else {
      console.log('No document data found.');
      return null;
    }

  } catch (error) {
    console.error("Error fetching document:", error.response ? error.response.data : error.message);
    return null;
  }
}


// Creation of the WebSocket server

// Define WebSocket server on port 4242
const wss = new WebSocket.Server({ port: 4242 });

// Broadcast function to send messages to all connected clients
function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}


// Define connection headers
const connectionHeaders = {
  "heart-beat": "50000,0",
  host: "/",
  'client-id': '3DSEpita-YKFL', // Unique Client ID
  login: login, // Your CLM Agent login
  passcode: password // CLM Agent passcode
};

// Define servers for failover
const servers = [ 
  { ssl: true, host: 'eu1-msgbus.3dexperience.3ds.com', port: 61616, connectHeaders: connectionHeaders },
  { ssl: true, host: 'eu1-msgbus-1.3dexperience.3ds.com', port: 61616, connectHeaders: connectionHeaders }
];

// Initialize stompit failover manager
const manager = new stompit.ConnectFailover(servers, {
  initialReconnectDelay: 100, // Start with 1 second delay
  maxReconnectDelay: 30000, // Maximum delay of 30 seconds
  useExponentialBackOff: true, // Exponential backoff
  maxReconnects: 30, // Retry a maximum of 10 times before giving up
  randomize: false // Disable randomization
});

// Define subscription headers
const subscribeHeaders = {
  'destination': '/topic/3dsevents.R1132102747346.3DSpace.user', // Tenant ID topic
  'activemq.subscriptionName': 'BSYGDYEHDUUE226373', // Unique subscription name
  'ack': 'client-individual' // Acknowledge mode
};

console.log('Connection to the message broker...');
// Connect to the broker
manager.connect((error, client, reconnect) => {
  if (error) {
    console.error('Connection error:', error.message);
    return;
  }

  console.log('Connected to the message broker');

  // Subscribe to the topic
  client.subscribe(subscribeHeaders, (subscribeError, message) => {
    if (subscribeError) {
      console.error('Subscription error:', subscribeError.message);
      return;
    }

    // Read the message

    message.readString('utf-8', async (readError, body) => {
      if (readError) {
        console.error('Error reading message:', readError.message);
        return;
      }
    
      try {
        // Attempt to parse the message as JSON and pretty-print
        const jsonMessage = JSON.parse(body);


        const relativePath = jsonMessage?.data?.subject?.relativePath;
        const source = jsonMessage?.data?.subject?.source;

        const title = await fetchDocument(relativePath, source, jsonMessage);
        
        if (title) {
          //console.log('Title after:', title);
          jsonMessage.data.subject.title = title;
        }
        
        console.log('Received message:', JSON.stringify(jsonMessage, null, 2));

        // Broadcast the event to all WebSocket clients
        broadcast(JSON.stringify(jsonMessage));
      } catch (parseError) {
        // If the message is not JSON, log it as a plain string
        console.log('Received non-JSON message:', body);
      }
    
      // Acknowledge the message
      client.ack(message);
    });

    


  });

  // Disconnect the client on application exit
  process.on('SIGINT', () => {
    console.log('Disconnecting from broker');
    client.disconnect();
    process.exit();
  });
});


// WebSocket server ready
wss.on('connection', (ws) => {
  console.log('Frontend connected to WebSocket');
  ws.on('message', (message) => {
    console.log('Received from frontend:', message);
    // Handle incoming messages from the frontend if needed
  });
});