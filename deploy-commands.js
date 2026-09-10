// This script registers the slash command with Discord's API.
// You only need to run this once, or when you change the command definition.

const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { clientId, guildId } = require('./config.json');
require('dotenv').config();

const commands = [
    // --- Help Command ---
    new SlashCommandBuilder()
        .setName('helpmarco')
        .setDescription('Lists all available commands and their uses.'),
        
    // --- Feedback Command ---
    new SlashCommandBuilder()
        .setName('send-feedback-embed')
        .setDescription('Sends the feedback embed to the configured channel.'),

    // --- Booking Commands ---
    new SlashCommandBuilder()
        .setName('send-booking-embed')
        .setDescription('Sends the booking embed to the configured channel.'),
    new SlashCommandBuilder()
        .setName('toggle-booking')
        .setDescription('Enable or disable cinematic bookings.')
        .addStringOption(option =>
            option.setName('status')
                .setDescription('The new status for bookings')
                .setRequired(true)
                .addChoices(
                    { name: 'Enable', value: 'enabled' },
                    { name: 'Disable', value: 'disabled' },
                )),
                
    // --- Creator Commands ---
    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Shows the top 10 creators in the server based on post count.'),

    // --- Logging Commands ---
    new SlashCommandBuilder()
        .setName('setbotlogs')
        .setDescription('Sets the channel for bot interaction logs.')
        .addChannelOption(option => 
            option.setName('channel')
                .setDescription('The channel to send logs to')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('toggle-logging')
        .setDescription('Enables or disables interaction logging.')
        .addBooleanOption(option => 
            option.setName('enabled')
                .setDescription('Whether logging should be enabled')
                .setRequired(true)),
]
.map(command => command.toJSON());


const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // The put method is used to fully refresh all commands in the guild with the current set
        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error);
    }
})();
