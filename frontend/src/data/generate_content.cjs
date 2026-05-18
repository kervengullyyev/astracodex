const fs = require('fs');
const path = require('path');

const coursesPath = path.join(__dirname, 'courses.json');
const coursesData = JSON.parse(fs.readFileSync(coursesPath, 'utf8'));

const contentDir = path.join(__dirname, 'content');
if (!fs.existsSync(contentDir)) {
  fs.mkdirSync(contentDir);
}

coursesData.courses.forEach(course => {
  const courseDir = path.join(contentDir, course.id);
  if (!fs.existsSync(courseDir)) {
    fs.mkdirSync(courseDir);
  }
  
  course.lessons.forEach(lesson => {
    // Skip arts/lesson-1 to not overwrite the user's newly written file
    if (course.id === 'arts' && lesson.id === 1) return;

    const lessonDir = path.join(courseDir, `lesson-${lesson.id}`);
    if (!fs.existsSync(lessonDir)) {
      fs.mkdirSync(lessonDir);
    }
    
    const contentPath = path.join(lessonDir, 'lessonContent.json');
    
    const sampleContent = {
      lessonTitle: lesson.title,
      teacherName: "Dr. Einstein",
      subject: course.name,
      level: "Beginner",
      lessonGoal: `Teach students the core concepts of ${lesson.title}.`,
      sections: [
        {
          id: "section-1",
          order: 1,
          type: "text",
          title: `Introduction to ${lesson.title}`,
          text: `Welcome to ${lesson.title}. In this lesson, you will learn about ${lesson.description}`
        },
        {
          id: "section-2",
          order: 2,
          type: "image",
          title: `Visualizing ${lesson.title}`,
          imageDescription: `An educational diagram showing concepts of ${lesson.title}.`,
          imageSource: "/section-2.png",
          components: [
            {
              id: "example-component",
              label: "Example Element",
              x: 150,
              y: 200
            }
          ]
        },
        {
          id: "section-3",
          order: 3,
          type: "interactive",
          title: `Practice ${lesson.title}`,
          htmlDescription: `Interactive exercise where students practice ${lesson.title}.`,
          htmlSource: "/section-3.html",
          components: [
            {
              id: "interactive-element",
              name: "Interactive Element",
              interactionType: "clickable"
            }
          ]
        }
      ]
    };
    
    fs.writeFileSync(contentPath, JSON.stringify(sampleContent, null, 2));
  });
});

console.log('Successfully generated new lesson folders and lessonContent.json files with the new schema!');
