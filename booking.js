const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType,
    PermissionsBitField,
    MessageFlags
} = require('discord.js');
const { 
    bookingChannelId,
    bookingCategoryId,
    bookingStatusChannelId,
    adminRoleId,
    bookingEmbed: bookingEmbedConfig,
    bookingStatusEmbeds
} = require('./config.json');

function isAdmin(member) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator) || member.roles.cache.has(adminRoleId);
}

// This function runs on startup to ensure the booking embed button is in the correct state
async function syncBookingEmbed(client, state) {
    try {
        const channel = await client.channels.fetch(bookingChannelId).catch(err => {
            if (err.code === 50001) {
                console.error(`❌ Missing Access to booking channel (${bookingChannelId}). Please check bot permissions.`);
            } else {
                throw err;
            }
            return null;
        });

        if (!channel || channel.type !== ChannelType.GuildText) {
            console.log("Booking channel not found or inaccessible for syncing, skipping.");
            return;
        }

        const messages = await channel.messages.fetch({ limit: 50 });
        const bookingMessage = messages.find(msg =>
            msg.author.id === client.user.id &&
            msg.embeds.length > 0 &&
            msg.embeds[0].title === bookingEmbedConfig.title
        );

        if (bookingMessage) {
            const currentButton = bookingMessage.components[0]?.components[0];
            if (!currentButton) return; // No button found on the message

            const isButtonDisabled = currentButton.disabled;
            const shouldButtonBeDisabled = !state.bookingsEnabled;

            if (isButtonDisabled !== shouldButtonBeDisabled) {
                console.log(`Syncing booking embed state to: ${state.bookingsEnabled ? 'Enabled' : 'Disabled'}`);
                const newButton = ButtonBuilder.from(currentButton).setDisabled(shouldButtonBeDisabled);
                const newRow = new ActionRowBuilder().addComponents(newButton);
                await bookingMessage.edit({ components: [newRow] });
                console.log("✅ Booking embed synced successfully.");
            } else {
                console.log("Booking embed is already in sync.");
            }
        } else {
            console.log("No booking embed found to sync.");
        }
    } catch (error) {
        console.error("Error during booking embed sync:", error);
    }
}

async function handleSendBookingEmbed(interaction, state) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: [MessageFlags.Ephemeral] });
    }
    const channel = interaction.client.channels.cache.get(bookingChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
        return interaction.reply({ content: 'Booking channel not found. Please check `config.json`.', flags: [MessageFlags.Ephemeral] });
    }

    const bookingEmbed = new EmbedBuilder().setColor(bookingEmbedConfig.color).setTitle(bookingEmbedConfig.title).setDescription(bookingEmbedConfig.description);
    // Use the persistent state to set the button's status
    const bookingButton = new ButtonBuilder().setCustomId('book_cinematic_button').setLabel('Book Cinematic').setStyle(ButtonStyle.Success).setEmoji('🎬').setDisabled(!state.bookingsEnabled);
    const row = new ActionRowBuilder().addComponents(bookingButton);

    await channel.send({ embeds: [bookingEmbed], components: [row] });
    await interaction.reply({ content: 'Booking embed sent successfully!', flags: [MessageFlags.Ephemeral] });
}

async function handleToggleBooking(interaction, state, saveState) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: [MessageFlags.Ephemeral] });
    }

    const status = interaction.options.getString('status');
    const client = interaction.client;

    // Update the state object and then save it
    state.bookingsEnabled = (status === 'enabled');
    await saveState(); // Persist the change to the file

    // Sync the embed immediately after changing the state
    await syncBookingEmbed(client, state);
    
    const statusChannel = client.channels.cache.get(bookingStatusChannelId);
    if (statusChannel && statusChannel.type === ChannelType.GuildText) {
        const statusConfig = state.bookingsEnabled ? bookingStatusEmbeds.enabled : bookingStatusEmbeds.disabled;
        const statusEmbed = new EmbedBuilder()
            .setColor(statusConfig.color)
            .setTitle(statusConfig.title)
            .setDescription(statusConfig.description)
            .setImage(statusConfig.imageUrl)
            .setTimestamp();
        
        await statusChannel.send({ embeds: [statusEmbed] });
    } else {
        console.error("Booking status channel not found or is not a text channel.");
    }

    await interaction.reply({ content: `Bookings have been **${status}**. State has been saved and embed has been updated.`, flags: [MessageFlags.Ephemeral] });
}

async function handleBookCinematicButton(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const guild = interaction.guild;
    const user = interaction.user;
    const channelName = `booking-${user.username.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()}`;
    
    const existingChannel = guild.channels.cache.find(c => c.name === channelName && c.parentId === bookingCategoryId);
    if (existingChannel) {
        return interaction.editReply({ content: `You already have an open booking channel: <#${existingChannel.id}>` });
    }

    try {
        const newChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: bookingCategoryId,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                { id: adminRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages] }
            ],
        });

        const welcomeEmbed = new EmbedBuilder().setColor(bookingEmbedConfig.color).setTitle(`Welcome, ${user.username}!`).setDescription(`Please describe your cinematic request here. An admin (<@&${adminRoleId}>) will be with you shortly.`);
        const closeButton = new ButtonBuilder().setCustomId('close_booking_button').setLabel('Close Booking').setStyle(ButtonStyle.Danger).setEmoji('✖️');
        const row = new ActionRowBuilder().addComponents(closeButton);

        await newChannel.send({ content: `<@${user.id}>`, embeds: [welcomeEmbed], components: [row] });
        await interaction.editReply({ content: `Your private booking channel has been created: <#${newChannel.id}>` });

    } catch (error) {
        console.error("Failed to create booking channel:", error);
        await interaction.editReply({ content: 'There was an error creating your booking channel. Please contact an admin.' });
    }
}

async function handleCloseBookingButton(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to close this booking.', flags: [MessageFlags.Ephemeral] });
    }
    
    await interaction.reply({ content: `This channel will be deleted in 5 seconds...` });
    
    setTimeout(() => {
        interaction.channel.delete('Booking completed.').catch(error => {
            console.error("Failed to delete channel:", error);
            interaction.followUp({ content: 'Could not delete the channel. Please check my permissions.', flags: [MessageFlags.Ephemeral] });
        });
    }, 5000);
}

module.exports = {
    syncBookingEmbed,
    handleSendBookingEmbed,
    handleToggleBooking,
    handleBookCinematicButton,
    handleCloseBookingButton,
    isAdmin
};
