# Event Sources

Event sources are the starting point for all data in the system. They represent
a stream of events that can be aggregated and analyzed.

## Creating an Event Source

To create an event source, navigate to the event sources page and click the
"Create New Source" button. You will need to provide a name and an optional
description for the source.

## Sending Events

Once you have created an event source, you can start sending events to it.
Events are sent as HTTP POST requests to the `/api/events` endpoint. The body of
the request should be a JSON object with the following properties:

- `source`: The ID of the event source.
- `type`: The type of the event.
- `payload`: The event payload.

## Example

Here is an example of how to send an event using `curl`:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"source":"YOUR_SOURCE_ID","type":"user_signup","payload":{"userId":"123"}}' \
  https://your-quant-instance.com/api/events
```
