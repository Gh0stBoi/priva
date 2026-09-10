const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    ChannelType,
    MessageFlags
} = require('discord.js');
const { 
    feedbackChannelId, 
    reviewsChannelId, 
    embed: embedConfig
} = require('./config.json');
const { isAdmin } = require('./booking'); // Reusing isAdmin

async function handleSendFeedbackEmbed(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: [MessageFlags.Ephemeral] });
    }
    const channel = interaction.client.channels.cache.get(feedbackChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
        return interaction.reply({ content: 'Feedback channel not found. Please check `config.json`.', flags: [MessageFlags.Ephemeral] });
    }
    const feedbackEmbed = new EmbedBuilder().setColor(embedConfig.color).setTitle(embedConfig.title).setDescription(embedConfig.description).setTimestamp();
    const feedbackButton = new ButtonBuilder().setCustomId('give_feedback_button').setLabel('Leave Feedback').setStyle(ButtonStyle.Primary).setEmoji('📝');
    const row = new ActionRowBuilder().addComponents(feedbackButton);
    await channel.send({ embeds: [feedbackEmbed], components: [row] });
    await interaction.reply({ content: 'Feedback embed sent successfully!', flags: [MessageFlags.Ephemeral] });
}

async function handleGiveFeedbackButton(interaction) {
    const modal = new ModalBuilder().setCustomId('feedback_modal').setTitle('Your Feedback');
    const ratingInput = new TextInputBuilder().setCustomId('rating_input').setLabel("Rating (1-5 Stars)").setStyle(TextInputStyle.Short).setPlaceholder('e.g., 5').setRequired(true).setMinLength(1).setMaxLength(1);
    const reviewInput = new TextInputBuilder().setCustomId('review_input').setLabel("Your detailed review").setStyle(TextInputStyle.Paragraph).setPlaceholder('I really liked...').setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(ratingInput), new ActionRowBuilder().addComponents(reviewInput));
    await interaction.showModal(modal);
}

async function handleFeedbackModalSubmit(interaction) {
    const rating = interaction.fields.getTextInputValue('rating_input');
    const review = interaction.fields.getTextInputValue('review_input');
    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return interaction.reply({ content: 'Please provide a valid rating between 1 and 5.', flags: [MessageFlags.Ephemeral] });
    }
    const reviewChannel = interaction.client.channels.cache.get(reviewsChannelId);
    if (!reviewChannel || reviewChannel.type !== ChannelType.GuildText) {
        return interaction.reply({ content: 'Could not submit review due to a configuration error.', flags: [MessageFlags.Ephemeral] });
    }
    const reviewEmbed = new EmbedBuilder().setColor('#57F287').setTitle('New Feedback Submitted!').setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() }).setThumbnail(interaction.user.displayAvatarURL()).addFields({ name: 'Rating', value: '⭐'.repeat(ratingNum) + '☆'.repeat(5 - ratingNum), inline: true },{ name: 'Submitted By', value: `<@${interaction.user.id}>`, inline: true },{ name: 'Review', value: review }).setTimestamp().setFooter({ text: `User ID: ${interaction.user.id}` });
    await reviewChannel.send({ embeds: [reviewEmbed] });
    await interaction.reply({ content: 'Thank you! Your feedback has been submitted successfully.', flags: [MessageFlags.Ephemeral] });
}

module.exports = {
    handleSendFeedbackEmbed,
    handleGiveFeedbackButton,
    handleFeedbackModalSubmit
};
