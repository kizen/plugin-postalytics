this.preserve = true;

const contact = await this.currentEntity();
const contactObj = await this.currentObject();

console.log("Contact:", contact);
console.log("Contact Object:", contactObj);

async function processContactFields(contact, obj) {
  const fields = {};
  const fieldnames = {};

  // Build field name mapping
  obj.fields.forEach((field) => {
    fieldnames[field.id] = field.name;
    if (field.is_default) {
      fields[field.name] = {
        field: field.id,
        field_display_name: field.display_name,
        field_type: field.field_type,
        value: contact[field.name],
        name: null,
      };
    }
  });

  // Converts multival fields to arrays
  contact.fields.forEach((fieldval) => {
    const fieldName = fieldnames[fieldval.field];
    if (!fieldName) return;

    if (fields[fieldName]) {
      fields[fieldName] = Array.isArray(fields[fieldName])
        ? [...fields[fieldName], fieldval]
        : [fields[fieldName], fieldval];
    } else {
      fields[fieldName] = fieldval;
    }
  });

  return fields;
}

const fields = await processContactFields(contact, contactObj);

console.log("Processed Fields:", fields);

// Map of required fields: kizen field -> postalytics field
const requiredFields = {
  city: "address_city",
  state: "address_state",
  street_address_1: "address_street",
  zipcode: "address_zip",
  first_name: "first_name",
  last_name: "last_name",
};

const missingFieldNames = Object.keys(requiredFields).filter((kizenField) => {
  return !fields[kizenField];
});

if (missingFieldNames.length > 0) {
  throw new Error(`The following required fields are missing from the contact: ${missingFieldNames.join(", ")}`);
}

const campaigns = [
  {
    endpoint_id: "123",
    name: "Drip1",
  },
  {
    endpoint_id: "456",
    name: "Drip2",
  },
];

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
      placeholder: "Select a campaign",
      options: campaigns.map((campaign) => ({
        label: campaign.name,
        value: campaign.id,
      })),
    },
  ],
});
