import { object, type ObjectSchema } from "valibot";

const schemas = new Map<ObjectSchema<any, any>, ObjectSchema<any, any>[]>();

export const extendSchema = <
  T extends ObjectSchema<any, any>,
  E extends ObjectSchema<any, any>,
>(target: T, extension: E) => {
  const all = schemas.get(target) ?? [];
  all.push(extension);
  schemas.set(target, all);
  const tg = schemas.get(target)?.reduce((acc, obj) => ({
    ...acc,
    ...obj.entries,
  }), { ...target.entries });
  Object.assign(target.entries, tg); // readonly my ass
};

export const useSchema = <
  T extends ObjectSchema<any, any>,
  C extends (schema: ObjectSchema<any, any>) => any,
>(
  schema: T,
  callback: C,
): ReturnType<C> => {
  const all = schemas.get(schema)?.reduce((acc, obj) => ({
    ...acc,
    ...obj.entries,
  }), { ...schema.entries });
  return callback(all ? object(all) : schema);
};
