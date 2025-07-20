import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import * as React from "react";

interface WelcomeEmailProps {
  firstName: string;
}

let slackLink = process.env.SLACK_LINK;

export const WelcomeEmail: React.FC<Readonly<WelcomeEmailProps>> = ({
  firstName,
}) => (
  <Html>
    <Head />
    <Preview>
      Welcome to Phish Directory - Your Shield Against Phishing Attacks
    </Preview>
    <Tailwind>
      <Body className="bg-[#f5f5f5] font-sans">
        <Container className="mx-auto my-[40px] max-w-[600px] rounded-[8px] bg-white p-[20px]">
          {/* Header with Logo */}
          <Section className="mt-[32px] text-center">
            <Img
              src="https://s3.hogwarts.dev/assets/phishdirectory.jpeg"
              alt="Phish Directory Logo"
              width="120"
              height="auto"
              className="w-[120px] h-auto object-cover mx-auto mb-[24px]"
            />
            <Heading className="text-[24px] font-bold text-[#55625c] my-[16px]">
              Welcome to Phish Directory
            </Heading>
            <Text className="text-[16px] text-[#55625c]">
              Your Shield Against Phishing Attacks
            </Text>
          </Section>

          <Hr className="border border-[#83bab4] my-[20px]" />

          {/* Main Content */}
          <Section className="mt-[32px]">
            <Text className="text-[16px] text-[#55625c] mb-[24px]">
              Hi {firstName}! Thank you for joining Phish Directory, the
              community-driven database of phishing URLs.
            </Text>

            <Text className="text-[16px] text-[#55625c] mb-[24px]">
              At Phish Directory, our mission is to help you stay safe from
              phishing attacks by providing you with the latest information on
              phishing URLs. With your participation, we can build a stronger
              defense against cyber threats.
            </Text>

            <Text className="text-[16px] text-[#55625c] mb-[24px]">
              Here's what you can do with Phish Directory:
            </Text>

            <ul className="list-disc pl-[20px] mb-[24px]">
              <li className="text-[16px] text-[#55625c]">
                Report suspicious URLs to our database
              </li>
              <li className="text-[16px] text-[#55625c]">
                Verify if a URL has been reported as phishing
              </li>
              <li className="text-[16px] text-[#55625c]">
                Stay updated on the latest phishing trends
              </li>
              <li className="text-[16px] text-[#55625c]">
                Contribute to a safer internet for everyone
              </li>
            </ul>

            <Section className="text-center my-[32px]">
              <Button
                className="bg-[#83bab4] text-white font-bold py-[12px] px-[24px] rounded-[4px] box-border"
                href="https://phish.directory/dashboard"
              >
                Access Your Dashboard
              </Button>
            </Section>

            {/* Open Source Feature Box */}
            <Section className="bg-[#f5f7f7] border-l-[4px] border-[#83bab4] p-[16px] rounded-[4px] my-[32px]">
              <Heading className="text-[18px] font-bold text-[#55625c] mb-[8px]">
                🔧 We're open source!
              </Heading>
              <Text className="text-[16px] text-[#55625c] m-0">
                Interested in helping develop Phish Directory API? Join our
                Slack and let us know or email{" "}
                <Link
                  href="mailto:devrel@phish.directory"
                  className="text-[#83bab4] font-bold"
                >
                  devrel@phish.directory
                </Link>
                . We welcome contributors of all skill levels to help make our
                project even better.
              </Text>
            </Section>

            <Heading className="text-[18px] font-bold text-[#55625c] mt-[32px] mb-[16px]">
              Join Our Community
            </Heading>

            <Text className="text-[16px] text-[#55625c] mb-[24px]">
              Click{" "}
              <Link href={slackLink} className="text-[#83bab4] font-bold">
                this link
              </Link>{" "}
              to join our Slack community and connect with other users and the
              team. Having trouble joining? Email{" "}
              <Link
                href="mailto:slack@phish.directory"
                className="text-[#83bab4]"
              >
                slack@phish.directory
              </Link>{" "}
              for assistance.
            </Text>

            <Heading className="text-[18px] font-bold text-[#55625c] mt-[32px] mb-[16px]">
              Share Your Work
            </Heading>

            <Text className="text-[16px] text-[#55625c] mb-[24px]">
              We'd love to see what you create with Phish Directory! Send your
              projects, tools, or integrations to{" "}
              <Link
                href="mailto:showcase@phish.directory"
                className="text-[#83bab4]"
              >
                showcase@phish.directory
              </Link>{" "}
              and we might feature your work in our community highlights.
            </Text>

            <Heading className="text-[18px] font-bold text-[#55625c] mt-[32px] mb-[16px]">
              Need Help?
            </Heading>

            <Text className="text-[16px] text-[#55625c] mb-[24px]">
              If you have any questions or need assistance, please don't
              hesitate to reach out to our support team at{" "}
              <Link
                href="mailto:support@phish.directory"
                className="text-[#83bab4]"
              >
                support@phish.directory
              </Link>
              .
            </Text>

            <Text className="text-[16px] text-[#55625c] mb-[24px]">
              Stay vigilant,
              <br />
              The Phish Directory Team
            </Text>
          </Section>

          <Hr className="border border-[#cbac91] my-[20px]" />

          {/* Footer */}
          <Section className="mt-[32px] text-center">
            <Text className="text-[14px] text-[#55625c] m-0">
              © 2025 Phish Directory. All rights reserved.
            </Text>
            {/* <Text className="text-[14px] text-[#55625c] m-0">
              123 Security Ave, Cyberspace, CS 12345
            </Text>
            <Text className="text-[14px] text-[#55625c] mt-[16px]">
              <Link href="https://phish.directory/preferences" className="text-[#83bab4]">
                Email Preferences
              </Link>{" "}
              •{" "}
              <Link href="https://phish.directory/unsubscribe" className="text-[#83bab4]">
                Unsubscribe
              </Link>
            </Text> */}
          </Section>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);
