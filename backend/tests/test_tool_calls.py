import json
import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from streaming.tool_calls import flush_buffer, tokenize_buffer


def highlight_tag(label: str = "A") -> str:
    return (
        '<tool_call>{"name":"highlight_component",'
        f'"arguments":{{"x":10,"y":20,"label":"{label}"}}}}</tool_call>'
    )


class ToolCallTimingTests(unittest.TestCase):
    def test_tool_between_sentences_stays_between_audio_chunks(self):
        remaining, events = tokenize_buffer(
            f"First sentence. {highlight_tag('target')}\nSecond sentence."
        )

        self.assertEqual("", remaining)
        self.assertEqual(["SENTENCE", "TOOL", "SENTENCE"], [kind for kind, _ in events])
        self.assertEqual("First sentence.", events[0][1])
        self.assertEqual("Second sentence.", events[2][1])
        self.assertEqual("highlight", json.loads(events[1][1])["type"])

    def test_tool_at_start_runs_before_following_sentence(self):
        remaining, events = tokenize_buffer(f"{highlight_tag()}\nLook here.")

        self.assertEqual("", remaining)
        self.assertEqual(["TOOL", "SENTENCE"], [kind for kind, _ in events])
        self.assertEqual("Look here.", events[1][1])

    def test_tool_inside_unfinished_sentence_waits(self):
        text = f"Look at this {highlight_tag()}"
        remaining, events = tokenize_buffer(text)

        self.assertEqual(text, remaining)
        self.assertEqual([], events)

    def test_final_flush_preserves_text_before_tool(self):
        events = flush_buffer(f"Final note {highlight_tag()} then the pointer lands.")

        self.assertEqual(["SENTENCE", "TOOL", "SENTENCE"], [kind for kind, _ in events])
        self.assertEqual("Final note", events[0][1])
        self.assertEqual("then the pointer lands.", events[2][1])


if __name__ == "__main__":
    unittest.main()
