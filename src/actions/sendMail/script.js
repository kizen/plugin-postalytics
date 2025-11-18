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

const contactFields = await processContactFields(contact, contactObj);

console.log("Processed Fields:", contactFields);

const requiredFields = ["city", "state", "street_address_1", "zipcode", "first_name", "last_name"];
const missingFieldNames = requiredFields.filter((reqField) => {
  return !contactFields[reqField];
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
      id: "campaign",
      required: true,
      placeholder: "Select a campaign",
      options: campaigns.map((campaign) => ({
        label: campaign.name,
        value: campaign.endpoint_id,
      })),
    },
  ],
});

console.log("Prompt Result:", result);

if (result.canceled) {
  this.showToast("Aborted by user.", { variant: "failure", autohide: true });
  return;
}

// Map of required fields: kizen field -> postalytics field
const fieldMap = {
  street_address_1: "address_street",
  street_address_2: "address_street2",
  city: "address_city",
  state: "address_state",
  zipcode: "address_zip",
  first_name: "first_name",
  last_name: "last_name",
  email: "email_address",
  phone_mobile: "mobile_phone",
  phone_home: "phone",
};

const processField = (field) => {
  if (Array.isArray(field)) {
    return field.map((f) => processField(f));
  } else if (field.field_type == "dynamictags" && Array.isArray(field.value)) {
    // Custom dynamictags field is array of objects, Native tags field is object with array value
    return field.value.map((tag) => tag.name || tag.value);
  } else if (field.field_type == "money") {
    return field.name.description || field.value;
  } else if (field.field_type == "rating") {
    // Rating has number for value and label for name
    return field.value || field.name;
  } else {
    return field.name || field.value || field;
  }
};

try {
  const selectedCampaign = result.values.campaign;
  console.log("Selected Campaign:", selectedCampaign);
  const postalyticsPayload = Object.fromEntries(
    Object.entries(fieldMap)
      .filter(([kizenField]) => contactFields[kizenField])
      .map(([kizenField, postalyticsField]) => {
        const processedField = processField(contactFields[kizenField]);
        if (Array.isArray(processedField)) {
          return [postalyticsField, processedField.join(", ")];
        }
        return [postalyticsField, processedField];
      })
  );
  console.log("Postalytics Payload:", postalyticsPayload);
  console.log(`Sending campaign "${selectedCampaign.label}" to Postalytics API v1/send/${selectedCampaign.value}...`);

  // Simulate sending mail
  await new Promise((resolve) => setTimeout(resolve, 1000));
  this.showToast(
    `Campaign "${selectedCampaign.label}" has been sent to ${contactFields.first_name.value} ${contactFields.last_name.value}.`,
    { variant: "success", autohide: false }
  );
} catch (error) {
  console.error("Error sending campaign mail:", error);
  this.showToast(`Failed to send campaign mail: ${error.message}`, { variant: "failure", autohide: false });
}
