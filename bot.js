const { 
    Client, 
    GatewayIntentBits, 
    ActivityType,
    Partials
} = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// --- Modules ---
// --- Modules ---
const booking = require('./booking');
const feedback = require('./feedback');
const counter = require('./counter');
const logger = require('./logger');
const sheets = require('./sheets');

// --- Bot State Management ---
const stateFilePath = path.join(__dirname, 'state.json');
let state = {
    bookingsEnabled: true,
    creatorStreaks: {},
    weeklyCreatorStreaks: {},
    weeklyPosts: [],
    botLogsChannelId: null,
    loggingEnabled: true
};

let isSaving = false;
let saveQueued = false;

// Function to save the current state to state.json with concurrency protection
async function saveState() {
    if (isSaving) {
        saveQueued = true;
        return;
    }

    isSaving = true;
    try {
        await fs.writeFile(stateFilePath, JSON.stringify(state, null, 4));
        sheets.syncStateToSheets(state).catch(e => console.error("Sheets Sync Error:", e));
    } catch (error) {
        console.error("CRITICAL: Error saving state:", error);
    } finally {
        isSaving = false;
        if (saveQueued) {
            saveQueued = false;
            await saveState(); // Process the next queued save
        }
    }
}

// Function to load the state from state.json on startup
async function loadState() {
    const defaultState = {
        bookingsEnabled: true,
        creatorStreaks: {},
        weeklyCreatorStreaks: {},
        weeklyPosts: [],
        botLogsChannelId: null,
        loggingEnabled: true
    };
    
    try {
        const data = await fs.readFile(stateFilePath, 'utf8');
        const loadedState = JSON.parse(data);
        state = { ...defaultState, ...loadedState }; 
        console.log("✅ State loaded successfully from state.json");
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log("⚠️ No state file found locally. Attempting to recover from Google Sheets...");
            const recoveredState = await sheets.pullStateFromSheets();
            if (recoveredState) {
                state = recoveredState;
                console.log("✅ State successfully recovered from Google Sheets!");
            } else {
                console.log("⚠️ Could not recover from Google Sheets. Creating one with default state.");
                state = defaultState;
            }
            await saveState();
        } else {
            console.error("Error loading state:", error);
        }
    }
}

// --- Client Initialization ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Message, Partials.Reaction, Partials.User]
});

// --- Bot Ready Event ---
client.once('clientReady', async () => {
    console.log(`✅ Ready! Logged in as ${client.user.tag}`);
    console.log(`Bot is on ${client.guilds.cache.size} servers.`);
    
    // --- Rotating Status Activity ---
    const activities = [
        { name: 'bookings', type: ActivityType.Listening },
        { name: 'Custom Status', type: ActivityType.Custom, state: 'Sorting bookings' },
        { name: 'your requests', type: ActivityType.Watching },
        { name: 'Custom Status', type: ActivityType.Custom, state: 'Developed by xGHOST' }
    ];
    let activityIndex = 0;

    const updateActivity = () => {
        const activity = activities[activityIndex];
        client.user.setActivity(activity);
        activityIndex = (activityIndex + 1) % activities.length;
    };
    
    updateActivity();
    setInterval(updateActivity, 30000);

    // Modules Initialization
    await booking.syncBookingEmbed(client, state);
    counter.setupCronJobs(client, state, saveState);
});

// --- Interaction Handler ---
client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;

    // Log the interaction
    logger.logInteraction(interaction, state);

    // Handle Slash Commands
    if (interaction.isCommand()) {
        switch (interaction.commandName) {
            case 'helpmarco':
                handleHelpCommand(interaction);
                break;
            case 'send-feedback-embed':
                feedback.handleSendFeedbackEmbed(interaction);
                break;
            case 'send-booking-embed':
                booking.handleSendBookingEmbed(interaction, state);
                break;
            case 'toggle-booking':
                booking.handleToggleBooking(interaction, state, saveState);
                break;
            case 'leaderboard':
                counter.handleLeaderboardCommand(interaction, state);
                break;
            case 'setbotlogs':
                logger.handleSetBotLogs(interaction, state, saveState);
                break;
            case 'toggle-logging':
                logger.handleToggleLogging(interaction, state, saveState);
                break;
        }
    }
    // Handle Button Clicks
    else if (interaction.isButton()) {
        switch (interaction.customId) {
            case 'give_feedback_button':
                feedback.handleGiveFeedbackButton(interaction);
                break;
            case 'book_cinematic_button':
                booking.handleBookCinematicButton(interaction);
                break;
            case 'close_booking_button':
                booking.handleCloseBookingButton(interaction);
                break;
        }
    }
    // Handle Modal Submissions
    else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'feedback_modal') {
            feedback.handleFeedbackModalSubmit(interaction);
        }
    }
});

// --- Message Handler for Creator Streaks ---
client.on('messageCreate', (message) => counter.handleMessageCreate(message, state, saveState));

// --- Reaction Handlers for Voting ---
client.on('messageReactionAdd', (reaction, user) => counter.handleReactionAdd(reaction, user, state, saveState));
client.on('messageReactionRemove', (reaction, user) => counter.handleReactionRemove(reaction, user, state, saveState));

const { EmbedBuilder, MessageFlags } = require('discord.js');

// --- Help Command ---
async function handleHelpCommand(interaction) {
    const helpEmbed = new EmbedBuilder()
        .setColor('#5865F2') // Discord Blurple
        .setAuthor({ 
            name: `${interaction.client.user.username} Support`, 
            iconURL: interaction.client.user.displayAvatarURL() 
        })
        .setTitle('🛠️ BOT COMMAND CENTER')
        .setDescription("Welcome! Below is a comprehensive list of all active commands and their functions. Use these to interact with the bot's features.")
        .addFields(
            { 
                name: '📢 General & Community', 
                value: "```/helpmarco``` - Access this help interface\n```/leaderboard``` - View the top 10 creator rankings", 
                inline: false 
            },
            { 
                name: '💎 Admin Controls', 
                value: "```/send-feedback-embed``` - Deploy the feedback panel\n```/send-booking-embed``` - Deploy the cinematic booking panel\n```/toggle-booking [status]``` - Control booking availability", 
                inline: false 
            },
            { 
                name: '📊 System Management', 
                value: "```/setbotlogs [channel]``` - Configure the log destination\n```/toggle-logging [enabled]``` - Enable or disable event tracking", 
                inline: false
            }
        )
        .setThumbnail(interaction.guild.iconURL())
        .setFooter({ text: 'Designed for Performance & Clarity', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    await interaction.reply({ embeds: [helpEmbed], flags: [MessageFlags.Ephemeral] });
}

// --- Express Server for Render ---
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is awake!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Web server is running on port ${PORT}`);
});

// --- Main Execution ---
(async () => {
    await loadState();
    await sheets.initSheets();
    sheets.syncStateToSheets(state).catch(e => console.error("Initial Sheets Sync Error:", e));
    client.login(process.env.DISCORD_TOKEN);
})();