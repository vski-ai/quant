use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::cmp::Ordering;

// A custom enum to represent JSON-like values that Serde can handle.
// It now supports nested objects and arrays.
#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
enum JsonValue {
    String(String),
    Number(f64),
    Boolean(bool),
    Array(Vec<JsonValue>),
    Object(HashMap<String, Box<JsonValue>>),
    Null,
}

impl Eq for JsonValue {}

// Manual implementation of PartialEq because derive macro struggles with f64 and recursion.
impl PartialEq for JsonValue {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (JsonValue::String(a), JsonValue::String(b)) => a == b,
            (JsonValue::Number(a), JsonValue::Number(b)) => a == b,
            (JsonValue::Boolean(a), JsonValue::Boolean(b)) => a == b,
            (JsonValue::Array(a), JsonValue::Array(b)) => a == b,
            (JsonValue::Object(a), JsonValue::Object(b)) => {
                if a.len() != b.len() {
                    return false;
                }
                a.iter().all(|(key, val_a)| {
                    b.get(key).map_or(false, |val_b| val_a == val_b)
                })
            },
            (JsonValue::Null, JsonValue::Null) => true,
            _ => false,
        }
    }
}

// Manual implementation of PartialOrd to define comparison logic.
impl PartialOrd for JsonValue {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        match (self, other) {
            (JsonValue::Number(a), JsonValue::Number(b)) => a.partial_cmp(b),
            (JsonValue::String(a), JsonValue::String(b)) => a.partial_cmp(b),
            _ => None, // Incomparable types
        }
    }
}


// Represents the compiled filter structure received from JavaScript.
#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
enum CompiledFilter {
    And { AND: Vec<CompiledFilter> },
    Or { OR: Vec<CompiledFilter> },
    // Use the concrete JsonValue instead of the opaque JsValue
    Condition(String, u8, JsonValue),
}

#[wasm_bindgen(typescript_custom_section)]
const TS_APPEND_CONTENT: &'static str = r#"
// Define a type for the row data for clarity.
type DataRow = Record<string, any>;
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "DataRow[]")]
    pub type DataRowArray;
}

/**
 * Filters a dataset based on a compiled filter configuration.
 * This function is designed for performance by operating on the entire dataset in bulk.
 *
 * @param {DataRow[]} data - The array of data objects to filter.
 * @param {any} filter - The compiled filter object.
 * @returns {Uint32Array} - An array of indices of the rows that match the filter.
 */
#[wasm_bindgen]
pub fn filter_dataset(data: DataRowArray, filter: JsValue) -> Result<Vec<u32>, JsValue> {
    let filter: CompiledFilter = serde_wasm_bindgen::from_value(filter)
        .map_err(|e| JsValue::from_str(&format!("Filter deserialization error: {}", e)))?;

    // Deserialize into a concrete Rust type that Serde understands.
    let data_array: Vec<HashMap<String, JsonValue>> = serde_wasm_bindgen::from_value(data.into())
        .map_err(|e| JsValue::from_str(&format!("Data deserialization error: {}", e)))?;

    let mut matched_indices = Vec::new();

    for (i, row) in data_array.iter().enumerate() {
        if evaluate_filter(row, &filter) {
            matched_indices.push(i as u32);
        }
    }

    Ok(matched_indices)
}

// Evaluates a single row against the filter logic.
fn evaluate_filter(row: &HashMap<String, JsonValue>, filter: &CompiledFilter) -> bool {
    match filter {
        CompiledFilter::And { AND } => AND.iter().all(|f| evaluate_filter(row, f)),
        CompiledFilter::Or { OR } => OR.iter().any(|f| evaluate_filter(row, f)),
        CompiledFilter::Condition(field, op, value) => {
            if let Some(row_val) = row.get(field) {
                // op enum: 0:EQ, 1:NEQ, 2:GT, 3:GTE, 4:LT, 5:LTE, 6:CONTAINS, 7:NOT_CONTAINS
                match op {
                    0 => row_val == value, // EQ
                    1 => row_val != value, // NEQ
                    2 => row_val > value,  // GT
                    3 => row_val >= value, // GTE
                    4 => row_val < value,  // LT
                    5 => row_val <= value, // LTE
                    6 => contains(row_val, value, false), // CONTAINS
                    7 => contains(row_val, value, true),  // NOT_CONTAINS
                    _ => false,
                }
            } else {
                false // Field not found in row
            }
        }
    }
}

// A helper for string containment checks.
fn contains(row_val: &JsonValue, filter_val: &JsonValue, negate: bool) -> bool {
    if let (JsonValue::String(row_str), JsonValue::String(filter_str)) = (row_val, filter_val) {
        let result = row_str.contains(filter_str);
        if negate { !result } else { result }
    } else {
        false
    }
}
