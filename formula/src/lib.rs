use nom::{
    branch::alt,
    bytes::complete::tag,
    character::complete::{alpha1, alphanumeric1, char, multispace0},
    combinator::{map, recognize},
    error::ParseError,
    multi::separated_list0,
    number::complete::double,
    sequence::{delimited, pair, tuple},
    IResult, Parser,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;
use js_sys::{Object, Reflect};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum Expr {
    Literal(f64),
    Identifier(String),
    FunctionCall(String, Vec<Expr>),
    BinaryOp {
        op: char,
        left: Box<Expr>,
        right: Box<Expr>,
    },
}

fn ws<'a, F, O, E: ParseError<&'a str>>(inner: F) -> impl FnMut(&'a str) -> IResult<&'a str, O, E>
where
    F: Parser<&'a str, O, E>,
{
    delimited(multispace0, inner, multispace0)
}

fn identifier(input: &str) -> IResult<&str, String> {
    map(
        recognize(pair(
            alt((alpha1, tag("_"))),
            recognize(nom::multi::many0_count(alt((alphanumeric1, tag("_"))))),
        )),
        |s: &str| s.to_string(),
    )(input)
}

fn parens(input: &str) -> IResult<&str, Expr> {
    ws(delimited(char('('), expr, char(')')))(input)
}

fn literal(input: &str) -> IResult<&str, Expr> {
    map(double, Expr::Literal)(input)
}

fn function_call(input: &str) -> IResult<&str, Expr> {
    map(
        tuple((
            identifier,
            ws(delimited(
                char('('),
                separated_list0(ws(char(',')), expr),
                char(')'),
            )),
        )),
        |(name, args)| Expr::FunctionCall(name, args),
    )(input)
}

fn primary(input: &str) -> IResult<&str, Expr> {
    alt((literal, function_call, map(identifier, Expr::Identifier), parens))(input)
}

fn term(input: &str) -> IResult<&str, Expr> {
    let (input, init) = ws(primary)(input)?;
    nom::multi::fold_many0(
        pair(ws(alt((char('*'), char('/')))), ws(primary)),
        move || init.clone(),
        |acc, (op, val)| Expr::BinaryOp {
            op,
            left: Box::new(acc),
            right: Box::new(val),
        },
    )(input)
}

fn expr(input: &str) -> IResult<&str, Expr> {
    let (input, init) = term(input)?;
    nom::multi::fold_many0(
        pair(ws(alt((char('+'), char('-')))), term),
        move || init.clone(),
        |acc, (op, val)| Expr::BinaryOp {
            op,
            left: Box::new(acc),
            right: Box::new(val),
        },
    )(input)
}

#[wasm_bindgen]
pub fn parse_formula(input: &str) -> Result<String, String> {
    match expr(input) {
        Ok(("", ast)) => Ok(serde_json::to_string(&ast).unwrap()),
        Ok((remaining, _)) => Err(format!("Failed to parse formula. Remaining input: '{}'", remaining)),
        Err(e) => Err(e.to_string()),
    }
}

fn evaluate_ast(ast: &Expr, context: &HashMap<String, f64>) -> Result<f64, String> {
    match ast {
        Expr::Literal(val) => Ok(*val),
        Expr::Identifier(id) => context
            .get(id)
            .cloned()
            .ok_or_else(|| format!("Identifier '{}' not found in context", id)),
        Expr::BinaryOp { op, left, right } => {
            let left_val = evaluate_ast(left, context)?;
            let right_val = evaluate_ast(right, context)?;
            match op {
                '+' => Ok(left_val + right_val),
                '-' => Ok(left_val - right_val),
                '*' => Ok(left_val * right_val),
                '/' => {
                    if right_val == 0.0 {
                        Ok(0.0) // Safe division
                    } else {
                        Ok(left_val / right_val)
                    }
                }
                _ => Err(format!("Unknown operator '{}'", op)),
            }
        }
        Expr::FunctionCall(name, args) => {
            let arg_vals: Vec<f64> = args
                .iter()
                .map(|arg| evaluate_ast(arg, context))
                .collect::<Result<Vec<_>, _>>()?;

            match name.as_str() {
                "pow" if arg_vals.len() == 2 => Ok(arg_vals[0].powf(arg_vals[1])),
                "sqrt" if arg_vals.len() == 1 => Ok(arg_vals[0].sqrt()),
                "max" if !arg_vals.is_empty() => Ok(arg_vals.iter().cloned().fold(f64::NEG_INFINITY, f64::max)),
                "min" if !arg_vals.is_empty() => Ok(arg_vals.iter().cloned().fold(f64::INFINITY, f64::min)),
                "abs" if arg_vals.len() == 1 => Ok(arg_vals[0].abs()),
                "round" if arg_vals.len() == 1 => Ok(arg_vals[0].round()),
                "ceil" if arg_vals.len() == 1 => Ok(arg_vals[0].ceil()),
                "floor" if arg_vals.len() == 1 => Ok(arg_vals[0].floor()),
                "sin" if arg_vals.len() == 1 => Ok(arg_vals[0].sin()),
                "cos" if arg_vals.len() == 1 => Ok(arg_vals[0].cos()),
                "tan" if arg_vals.len() == 1 => Ok(arg_vals[0].tan()),
                "log" if arg_vals.len() == 1 => Ok(arg_vals[0].ln()),
                "log10" if arg_vals.len() == 1 => Ok(arg_vals[0].log10()),
                "exp" if arg_vals.len() == 1 => Ok(arg_vals[0].exp()),

                _ => Err(format!("Unknown function '{}' or wrong number of arguments", name)),
            }
        }
    }
}

#[wasm_bindgen]
pub fn evaluate(ast_json: &str, context_keys: Vec<String>, context_values: Vec<f64>) -> Result<f64, String> {
    let ast: Expr = serde_json::from_str(ast_json)
        .map_err(|e| format!("AST Deserialization Error: {}", e))?;
    
    if context_keys.len() != context_values.len() {
        return Err("Context keys and values must have the same length".to_string());
    }

    let context: HashMap<String, f64> = context_keys.into_iter().zip(context_values.into_iter()).collect();

    evaluate_ast(&ast, &context)
}


#[wasm_bindgen]
pub fn compute(
    context_keys: Vec<String>,
    context_values: Vec<f64>,
    computed_keys: Vec<String>,
    computed_formulas: Vec<String>,
) -> Result<JsValue, String> {
    if context_keys.len() != context_values.len() {
        return Err("Context keys and values must have the same length".to_string());
    }
    if computed_keys.len() != computed_formulas.len() {
        return Err("Computed keys and formulas must have the same length".to_string());
    }

    let context: HashMap<String, f64> = context_keys.clone().into_iter().zip(context_values.clone().into_iter()).collect();
    let obj = Object::new();

    for (key, formula) in computed_keys.iter().zip(computed_formulas.iter()) {
        let ast_json = parse_formula(formula)?;
        let ast: Expr = serde_json::from_str(&ast_json)
            .map_err(|e| format!("AST Deserialization Error: {}", e))?;
        let result = evaluate_ast(&ast, &context)?;
        Reflect::set(&obj, &key.into(), &result.into()).unwrap();
    }

    for (key, value) in context_keys.iter().zip(context_values.iter()) {
        Reflect::set(&obj, &key.into(), &(*value).into()).unwrap();
    }

    Ok(obj.into())
}