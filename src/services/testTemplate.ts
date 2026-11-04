import type { TestDocument } from '@/types/test';

export const SAMPLE_TEST_TEMPLATE: TestDocument = {
  schemaVersion: '1.0',
  id: 'b1-sample-test-01',
  title: 'B1 Intermediate Comprehensive Practice Examination',
  description: 'Đề thi mẫu chuẩn CEFR B1 bao gồm đầy đủ 4 kỹ năng: Reading (Đọc hiểu), Listening (Nghe hiểu), Speaking (Nói) và Writing (Viết).',
  sections: {
    reading: {
      instructions: 'Đọc kỹ các đoạn văn sau và trả lời toàn bộ các câu hỏi bên dưới.',
      passages: [
        {
          id: 'r-p1',
          title: 'The Evolution of Remote Work and Modern Cities',
          content: 'Over the past decade, technological advancements and shifting workplace cultures have transformed how and where people work. The widespread adoption of remote and hybrid work models has significantly reduced the necessity for daily commuting to centralized business districts.\n\nAs a consequence, urban planners are observing notable demographic shifts. Many professionals are moving to suburban and regional areas in search of lower living costs and more spacious accommodation. Meanwhile, city centers are adapting by converting surplus commercial office spaces into residential units, cultural hubs, and green public parks.',
          questions: [
            {
              id: 'r-q1',
              type: 'multiple_choice',
              prompt: 'What is the main consequence of remote work mentioned in paragraph 2?',
              options: [
                { id: 'A', text: 'An increase in daily vehicular congestion in city centers' },
                { id: 'B', text: 'A demographic shift toward suburban and regional areas' },
                { id: 'C', text: 'A sharp decrease in the number of residential conversions' },
                { id: 'D', text: 'A complete shutdown of cultural hubs and public parks' }
              ],
              correctAnswer: 'B',
              explanation: 'Đoạn 2 nêu rõ: "Many professionals are moving to suburban and regional areas in search of lower living costs...".'
            },
            {
              id: 'r-q2',
              type: 'multiple_select',
              prompt: 'Which TWO new uses for surplus commercial offices are mentioned in the text?',
              options: [
                { id: 'A', text: 'Residential units' },
                { id: 'B', text: 'Heavy industrial factories' },
                { id: 'C', text: 'Cultural hubs' },
                { id: 'D', text: 'Long-term parking lots' }
              ],
              correctAnswers: ['A', 'C'],
              explanation: 'Đoạn 2 đề cập đến việc chuyển đổi thành: "residential units, cultural hubs, and green public parks".'
            },
            {
              id: 'r-q3',
              type: 'fill_blank',
              prompt: 'City centers are adapting by converting surplus office spaces into residential units, cultural hubs, and green public ________.',
              acceptedAnswers: ['parks', 'park'],
              caseSensitive: false,
              explanation: 'Đoạn cuối câu văn chỉ rõ: "...green public parks".'
            },
            {
              id: 'r-q4',
              type: 'true_false_ng',
              prompt: 'The cost of living in regional areas is generally higher than in downtown city centers.',
              correctAnswer: 'FALSE',
              explanation: 'Bài đọc chỉ ra các chuyên gia chuyển ra ngoại ô/khu vực vùng lân cận để tìm "lower living costs" (chi phí sinh hoạt thấp hơn).'
            }
          ]
        }
      ]
    },
    listening: {
      instructions: 'Lắng nghe các đoạn hội thoại hoặc độc thoại và chọn câu trả lời đúng nhất.',
      parts: [
        {
          id: 'l-p1',
          title: 'Part 1: Inquiring about a Local Library Membership',
          transcript: 'Clerk: Good morning! Welcome to the Central Community Library. How can I assist you today?\n\nVisitor: Hi, I moved here recently and would like to register for a library card.\n\nClerk: Wonderful! To set up your account, I just need a photo ID and a recent utility bill showing your current residential address.\n\nVisitor: I have my passport and my latest electricity bill right here.\n\nClerk: That is perfect. Standard membership allows you to borrow up to five books for three weeks.',
          audioConfig: {
            scenario: 'everyday_dialogue',
            accent: 'british',
            pacing: 'moderate',
            overallStyle: 'friendly and informative'
          },
          speakers: [
            { name: 'Clerk', gender: 'female' },
            { name: 'Visitor', gender: 'male' }
          ],
          questions: [
            {
              id: 'l-q1',
              type: 'multiple_choice',
              prompt: 'What documents does the visitor present to the clerk?',
              options: [
                { id: 'A', text: 'A student card and a rental contract' },
                { id: 'B', text: 'A passport and an electricity bill' },
                { id: 'C', text: 'A driving license and a bank statement' },
                { id: 'D', text: 'A national ID card and a water bill' }
              ],
              correctAnswer: 'B',
              explanation: 'Khách tham quan nói: "I have my passport and my latest electricity bill right here."'
            },
            {
              id: 'l-q2',
              type: 'fill_blank',
              prompt: 'Under standard membership, a reader is permitted to borrow up to ________ books at a time.',
              acceptedAnswers: ['5', 'five'],
              caseSensitive: false,
              explanation: 'Nhân viên thư viện thông báo: "...borrow up to five books for three weeks."'
            }
          ]
        }
      ]
    }
  }
};
