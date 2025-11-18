this.preserve = true;

const contact = await this.currentEntity();

// Map of required fields: kizen field -> postalytics field
const requiredFields = {
  city: "address_city",
  state: "address_state",
  street: "address_street",
  zip: "address_zip",
  first_name: "first_name",
  last_name: "last_name",
};

const missingFields = requiredFields.filter(([kizenField, postalyticsField]) => {
  return !contact[postalyticsField];
});

if (missingFields.length > 0) {
  const missingFieldNames = missingFields.map(([kizenField, postalyticsField]) => kizenField);
  throw new Error(`The following required fields are missing from the contact: ${missingFieldNames.join(", ")}`);
}

const campaigns = [];

const result = await this.prompt({
  title: "Send Campaign Mail",
  confirmButton: {
    label: "Send Mail",
    variant: "standard",
  },
  cancelButton: {
    label: "Cancel",
    variant: "text",
  },
  size: "medium",
  content: [
    {
      type: "description",
      content: "Select the campaign you would like to send to this contact.",
    },
    {
      type: "dropdown",
      label: "Campaign",
      key: "campaign_id",
      required: true,
      fetchMethod: "GET",
      options: campaigns.map((campaign) => ({
        label: campaign.name,
        value: campaign.id,
      })),
      placeholder: "Select a campaign",
    },
  ],
});
