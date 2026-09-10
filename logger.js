const { EmbedBuilder, ChannelType, MessageFlags } = require('discord.js');
const { isAdmin } = require('./booking');

/**
 * Logs an interaction to the console and a Discord channel if configured.
 * @param {Interaction} interaction The interaction object.
 * @param {object} state The bot's state.
 */
async function logInteraction(interaction, state) {
    if (!state.loggingEnabled) return;

    let logType = 'Unknown';
    let detail = '';

    if (interaction.isCommand()) {
        logType = 'Slash Command';
        detail = `/${interaction.commandName}`;
    } else if (interaction.isButton()) {
        logType = 'Button Click';
        detail = `ID: ${interaction.customId}`;
    } else if (interaction.isModalSubmit()) {
        logType = 'Modal Submit';
        detail = `ID: ${interaction.customId}`;
    }

    const logMessage = `[LOG] ${interaction.user.tag} (${interaction.user.id}) used ${logType}: ${detail}`;
    console.log(logMessage);

    // Discord Channel Logging
    if (state.botLogsChannelId) {
        try {
            const logChannel = await interaction.client.channels.fetch(state.botLogsChannelId);
            if (logChannel && logChannel.type === ChannelType.GuildText) {
                const logEmbed = new EmbedBuilder()
                    .setColor('#7289da')
                    .setTitle(`Interaction Log: ${logType}`)
                    .addFields(
                        { name: 'User', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
                        { name: 'Action', value: detail, inline: true },
                        { name: 'Channel', value: `${interaction.channel}`, inline: true }
                    )
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed] });
            }
        } catch (error) {
            if (error.code === 50001 || error.code === 10003) {
                console.warn(`[Logger] Log channel is inaccessible (code: ${error.code}). Clearing botLogsChannelId from state.`);
                state.botLogsChannelId = null;
            } else {
                console.error("Failed to send log to Discord channel:", error);
            }
        }
    }
}

/**
 * Logs a generic bot event to the console and a Discord channel if configured.
 * @param {Client} client The Discord client.
 * @param {object} state The bot's state.
 * @param {string} title The title of the event.
 * @param {string} description The description of the event.
 * @param {string} color The hex color for the embed (optional).
 */
async function logEvent(client, state, title, description, color = '#3498db') {
    if (!state.loggingEnabled) return;

    const logMessage = `[EVENT] ${title}: ${description}`;
    console.log(logMessage);

    if (state.botLogsChannelId) {
        try {
            const logChannel = await client.channels.fetch(state.botLogsChannelId);
            if (logChannel && logChannel.type === ChannelType.GuildText) {
                const logEmbed = new EmbedBuilder()
                    .setColor(color)
                    .setTitle(title)
                    .setDescription(description)
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed] });
            }
        } catch (error) {
            if (error.code === 50001 || error.code === 10003) {
                console.warn(`[Logger] Log channel is inaccessible (code: ${error.code}). Clearing botLogsChannelId from state.`);
                state.botLogsChannelId = null;
            } else {
                console.error("Failed to send event log to Discord channel:", error);
            }
        }
    }
}

async function handleSetBotLogs(interaction, state, saveState) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: [MessageFlags.Ephemeral] });
    }

    const channel = interaction.options.getChannel('channel');
    if (channel.type !== ChannelType.GuildText) {
        return interaction.reply({ content: 'Please select a valid text channel.', flags: [MessageFlags.Ephemeral] });
    }

    state.botLogsChannelId = channel.id;
    await saveState();

    await interaction.reply({ content: `✅ Bot logs will now be sent to ${channel}.`, flags: [MessageFlags.Ephemeral] });
}

async function handleToggleLogging(interaction, state, saveState) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: [MessageFlags.Ephemeral] });
    }

    const enabled = interaction.options.getBoolean('enabled');
    state.loggingEnabled = enabled;
    await saveState();

    await interaction.reply({ content: `✅ Interaction logging has been **${enabled ? 'Enabled' : 'Disabled'}**.`, flags: [MessageFlags.Ephemeral] });
}

module.exports = {
    logInteraction,
    logEvent,
    handleSetBotLogs,
    handleToggleLogging
};
