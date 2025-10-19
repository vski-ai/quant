import { faker } from "@faker-js/faker";

// Let's define a recursive function to generate nested group data
function generateGroupData(level = 0, maxLevel = 3, parentId = null) {
  const items = [];
  const numItems = 5;

  for (let i = 0; i < numItems; i++) {
    const id = faker.string.uuid();
    const isGroup = level < maxLevel && faker.datatype.boolean();

    const baseItem = {
      id,
      $parent_id: parentId,
      $group_by: "name",
      $group_level: level,
      name: faker.commerce.productName(),
      price: faker.commerce.price(),
      quantity: faker.number.int({ min: 1, max: 100 }),
      timestamp: faker.date.recent().toISOString(),
    };

    if (isGroup) {
      baseItem.$is_group_root = true;
      items.push(baseItem);
      const children = generateGroupData(
        level + 1,
        maxLevel,
        [parentId, id].filter(Boolean).flat(),
      );
      items.push(...children);
    } else {
      items.push(baseItem);
    }
  }

  return items;
}

export function generateMockData() {
  return generateGroupData();
}
