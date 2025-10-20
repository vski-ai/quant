use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use js_sys::{Array, Object, Reflect};

#[derive(Serialize, Deserialize, Debug)]
pub struct LeafAggregate {
    pub group: HashMap<String, String>,
    pub value: f64,
    pub timestamp: i64,
}

#[derive(Debug)]
struct TreeNode {
    children: HashMap<String, TreeNode>,
    value: f64,
    timestamp: i64,
    group_field: String,
    group_value: String,
    level: usize,
    group_path: HashMap<String, String>,
}

impl TreeNode {
    fn new(group_field: String, group_value: String, level: usize, parent_group_path: &HashMap<String, String>) -> Self {
        let mut group_path = parent_group_path.clone();
        group_path.insert(group_field.clone(), group_value.clone());
        TreeNode {
            children: HashMap::new(),
            value: 0.0,
            timestamp: 0,
            group_field,
            group_value,
            level,
            group_path,
        }
    }
}

#[wasm_bindgen]
pub fn build_hierarchy(leaf_aggregates_js: JsValue, group_by_js: JsValue, metric_js: JsValue, sort_by_js: JsValue) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();

    let leaf_aggregates: Vec<LeafAggregate> = serde_wasm_bindgen::from_value(leaf_aggregates_js)?;
    let group_by: Vec<String> = serde_wasm_bindgen::from_value(group_by_js)?;
    let metric: String = serde_wasm_bindgen::from_value(metric_js)?;
    let sort_by: Option<String> = serde_wasm_bindgen::from_value(sort_by_js).ok();

    let mut tree = HashMap::new();

    for leaf in leaf_aggregates {
        if leaf.group.is_empty() {
            continue;
        }

        let mut current_children = &mut tree;
        let mut parent_group_path = HashMap::new();

        for (i, group_field) in group_by.iter().enumerate() {
            if let Some(group_value) = leaf.group.get(group_field) {
                let key = group_value.clone();
                let current_node = current_children
                    .entry(key)
                    .or_insert_with(|| TreeNode::new(group_field.clone(), group_value.clone(), i, &parent_group_path));

                current_node.value += leaf.value;
                if leaf.timestamp > current_node.timestamp {
                    current_node.timestamp = leaf.timestamp;
                }
                parent_group_path = current_node.group_path.clone();
                current_children = &mut current_node.children;
            }
        }
    }

    let mut flat_list = Vec::new();
    let mut id_counter = 1;
    flatten(&tree, Vec::new(), &mut flat_list, &metric, &group_by, &sort_by, &mut id_counter);

    let array = Array::new();
    for item in flat_list {
        array.push(&item);
    }

    Ok(array.into())
}

fn flatten(
    nodes: &HashMap<String, TreeNode>,
    parent_ids: Vec<String>,
    flat_list: &mut Vec<JsValue>,
    metric: &str,
    group_by: &[String],
    sort_by: &Option<String>,
    id_counter: &mut i32,
) {
    let mut sorted_nodes: Vec<_> = nodes.values().collect();

    if let Some(sort_by_field) = sort_by {
        sorted_nodes.sort_by(|a, b| {
            let val_a = if sort_by_field == "groupValue" {
                a.group_value.clone()
            } else {
                a.group_path.get(sort_by_field).cloned().unwrap_or_default()
            };
            let val_b = if sort_by_field == "groupValue" {
                b.group_value.clone()
            } else {
                b.group_path.get(sort_by_field).cloned().unwrap_or_default()
            };
            val_a.cmp(&val_b)
        });
    } else {
        sorted_nodes.sort_by(|a, b| a.group_value.cmp(&b.group_value));
    }

    for node in sorted_nodes {
        let id = format!("ri-{}", id_counter);
        *id_counter += 1;
        let obj = Object::new();

        Reflect::set(&obj, &"id".into(), &id.clone().into()).unwrap();
        if parent_ids.is_empty() {
            Reflect::set(&obj, &"$parent_id".into(), &JsValue::NULL).unwrap();
        } else {
            let parent_ids_array = Array::new();
            for parent_id in &parent_ids {
                parent_ids_array.push(&parent_id.clone().into());
            }
            Reflect::set(&obj, &"$parent_id".into(), &parent_ids_array.into()).unwrap();
        }
        Reflect::set(&obj, &"$group_by".into(), &node.group_field.clone().into()).unwrap();
        Reflect::set(&obj, &"$group_level".into(), &(node.level as u32).into()).unwrap();
        Reflect::set(&obj, &metric.into(), &node.value.into()).unwrap();
        Reflect::set(&obj, &"timestamp".into(), &(node.timestamp as f64).into()).unwrap();
        Reflect::set(&obj, &"$is_group_root".into(), &(!node.children.is_empty()).into()).unwrap();

        for field in group_by {
            if let Some(value) = node.group_path.get(field) {
                Reflect::set(&obj, &field.into(), &value.clone().into()).unwrap();
            } else {
                Reflect::set(&obj, &field.into(), &JsValue::NULL).unwrap();
            }
        }

        flat_list.push(obj.into());
        let mut new_parent_ids = parent_ids.clone();
        new_parent_ids.push(id);
        flatten(&node.children, new_parent_ids, flat_list, metric, group_by, sort_by, id_counter);
    }
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn error(s: &str);
}