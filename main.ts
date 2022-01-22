import { Boom } from "@hapi/boom"
import makeWASocket, { DisconnectReason, useSingleFileAuthState} from "@adiwajshing/baileys"
import { join } from 'path';
const fs = require('fs')
const chalk = require('chalk');
const wa = require('./core/helper')
const TRANSMIT = require('./core/transmission')


const { state, saveState } = useSingleFileAuthState('./auth_info_multi.json')

// start a connection 
const startSock = () => {
    
    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state
    })

    var commandHandler = new Map()
    var moduleFiles = fs.readdirSync(join(__dirname, 'modules')).filter((file) => file.endsWith('.ts'))
    var moduleSuccess = true
    for (var file of moduleFiles) {
        try {
            const command = require(join(__dirname, 'modules', `${file}`));
            console.log(
                chalk.magentaBright("[INFO] Successfully imported module"),
                chalk.cyanBright.bold(`${file}`)
            )
            commandHandler.set(command.name, command);
        } catch (error) {
            moduleSuccess = false
            console.log(
                chalk.blueBright.bold("[INFO] Could not import module"),
                chalk.redBright.bold(`${file}`)
            )
            console.log(`[ERROR] `, error);
          //  process.exit(-1)
        }
    }

    if(moduleSuccess) console.log(chalk.green.bold("[INFO] All Plugins Installed Successfully. The bot is ready to use."))
       else console.log(chalk.red.bold("[ERROR] Some plugins weren't installed"))
    
    sock.ev.on('messages.upsert', async m => {
           
        const chat = m.messages[0]
        const sender = chat.key.remoteJid
        const groupMetaData = sender.endsWith("@g.us") ? await sock.groupMetadata(sender) : ''

        if(chat.key.fromMe || m.type !== 'notify') return

        var BotsApp = wa.resolve(chat,sock, groupMetaData);   
        
        if(BotsApp.isCmd){

            console.log(chalk.redBright.bold(`[INFO] ${BotsApp.commandName} command received.`));
            const command = commandHandler.get(BotsApp.commandName);
            var args = BotsApp.body.trim().split(/\s+/).slice(1);

            if (!command) {
                await TRANSMIT.sendMessageWTyping(sock,BotsApp.chat,{text:"```Woops, invalid command! Use```  *.help*  ```to display the command list.```"});
                return;
            } else if (command && BotsApp.commandName == "help") {
                try {
                    command.handle(sock, chat, BotsApp, args, commandHandler);
                    return;
                } catch (err) {
                    console.log(chalk.red("[ERROR] ", err));
                    return;
                }
            }
            try {
                command.handle(sock, chat, BotsApp, args).catch(err => console.log("[ERROR] " + err));
            } catch (err) {
                console.log(chalk.red("[ERROR] ", err));
            }
        }
    })

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if(connection === 'close') {
            // reconnect if not logged out
            if((lastDisconnect.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut) {
                startSock()
            } else {
                console.log('connection closed')
            }
        }
        
        console.log('connection update', update)
    })
    // listen for when the auth credentials is updated
    sock.ev.on('creds.update', saveState)

    return sock
}

startSock()