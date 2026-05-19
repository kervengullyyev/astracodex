import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from lesson.context import build_lesson_context


class LessonContextToolModeTests(unittest.TestCase):
    def test_viewed_interactive_section_gets_interactive_tool_mode(self):
        content = {
            "lessonTitle": "Test Lesson",
            "teacherName": "Einstein",
            "sections": [
                {
                    "id": "section-1",
                    "order": 1,
                    "type": "image",
                    "title": "Image Section",
                    "components": [{"id": "planet", "label": "Planet", "x": 20, "y": 30}],
                },
                {
                    "id": "section-2",
                    "order": 2,
                    "type": "interactive",
                    "title": "Interactive Section",
                    "components": [{"id": "phase-name", "name": "Current phase name", "interactionType": "show"}],
                },
            ],
        }

        prompt = build_lesson_context(content, current_section_number=1, viewed_slide=2)

        self.assertIn('CURRENT FOCUS:\nYou are teaching Section-2: "Interactive Section" (Type: interactive).', prompt)
        self.assertIn("### ACTIVE TOOL MODE: INTERACTIVE", prompt)
        self.assertIn("NEVER use `highlight_component`", prompt)

    def test_image_section_gets_image_tool_mode(self):
        content = {
            "lessonTitle": "Test Lesson",
            "teacherName": "Einstein",
            "sections": [
                {
                    "id": "section-1",
                    "order": 1,
                    "type": "image",
                    "title": "Image Section",
                    "components": [{"id": "planet", "label": "Planet", "x": 20, "y": 30}],
                },
            ],
        }

        prompt = build_lesson_context(content, current_section_number=1)

        self.assertIn("### ACTIVE TOOL MODE: IMAGE", prompt)
        self.assertIn("use `highlight_component`", prompt)


if __name__ == "__main__":
    unittest.main()
